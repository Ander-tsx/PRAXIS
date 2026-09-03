import type { ProjectTemplate, TemplateDraftResult, TemplateDraftState } from '../api/domain';
import { TEMPLATE_BRIEF_MAX, TEMPLATE_BRIEF_MIN } from '../api/domain';
import { ApiError } from '../api/envelope';
import { createServerApiClient } from '../auth/server-client';
import { QUOTA_EXCEEDED_CODE, detallesDeCuota } from '../billing/planes';

/**
 * Le pide al asistente una plantilla para un proyecto que aún no existe.
 *
 * Una llamada a `POST /me/assistant/project-draft`, que **no crea nada**:
 * devuelve nombres. Quien los materializa es [`aplicarPlantilla`], y solo
 * después de que alguien haya visto el plan y lo haya aceptado.
 *
 * Vive en `commons` y no en la zona porque la revisión del plan
 * (`TemplatePlanReview`) y su aplicación (`aplicarPlantilla`) también, y las
 * tres tienen que estar de acuerdo sobre qué es una plantilla válida.
 *
 * ⚠️ Se valida el largo **aquí también**, aunque el DTO del gateway lo exija: el
 * mensaje llega antes y señala el campo, que es la regla de siempre al escribir
 * un fetch. Y el mínimo no es capricho — con cuatro palabras el modelo devuelve
 * la plantilla genérica que cualquiera habría escrito a mano en menos tiempo.
 */
export async function pedirBorrador(
  brief: string,
  /**
   * Un ajuste sobre el plan que ya se propuso.
   *
   * Con los dos —el texto y el plan anterior— la llamada deja de ser «propón
   * algo» y pasa a ser «cambia esto de lo que ya propusiste». Sin ellos se
   * genera de cero, que es la primera vez.
   */
  ajuste?: { texto: string; previa: ProjectTemplate },
  /**
   * A qué organización se le cobra el turno de IA.
   *
   * ⚠️ **Ya resuelta** (`loadPrivateChrome` → `resolverOrganizacionActiva`), no
   * la cookie en crudo. Aquí se leía con `getOrganizacionActiva()`, que devuelve
   * lo que puso el navegador **sin comprobar**: con una cookie que apunta a una
   * organización de la que ya te fueron, la barra lateral repliega a la personal
   * y esto seguía mandando la vieja, así que el gateway respondía `403
   * NOT_IN_ORG` y la pantalla solo decía que no se pudo. Ver el aviso de
   * `theme/organizacion.ts`.
   */
  organizationId?: string | null,
): Promise<TemplateDraftState> {
  const texto = brief.trim();

  if (texto.length < TEMPLATE_BRIEF_MIN) {
    return {
      resultado: null,
      error: `Cuéntale un poco más: al menos ${TEMPLATE_BRIEF_MIN} caracteres.`,
      sinCuota: false,
      cuota: null,
    };
  }

  if (texto.length > TEMPLATE_BRIEF_MAX) {
    return {
      resultado: null,
      error: `Son ${texto.length} caracteres y el máximo es ${TEMPLATE_BRIEF_MAX}.`,
      sinCuota: false,
      cuota: null,
    };
  }

  try {
    const resultado = await createServerApiClient().post<TemplateDraftResult>(
      '/me/assistant/project-draft',
      {
        brief: texto,
        /* Solo si los hay: un campo vacío de más es un 400 (CLAUDE.md). El plan
           anterior viaja en JSON — el DTO lo declara como cadena a propósito,
           ver `TEMPLATE_PREVIEW_MAX`. */
        ...(ajuste?.texto.trim()
          ? { ajuste: ajuste.texto.trim(), previa: JSON.stringify(ajuste.previa) }
          : {}),
        /* Esta ruta **gasta cuota de IA y no crea nada**, así que hay que decir
           a qué organización se le cobra: el proyecto todavía no existe. El
           gateway valida la pertenencia antes de usarla y responde 403
           `NOT_IN_ORG` si no es tuya — es un filtro, no una llave. */
        ...(organizationId ? { organizationId } : {}),
      },
    );

    /* Se confirma contra el `data`, no contra el status: un 200 con una
       plantilla sin espacios no es una plantilla. */
    if (!resultado?.plantilla?.nombre || resultado.plantilla.espacios.length === 0) {
      return {
        resultado: null,
        error: 'El asistente no ha sabido proponer una plantilla. Prueba a contarle algo más.',
        sinCuota: false,
        cuota: null,
      };
    }

    return { resultado, error: null, sinCuota: false, cuota: null };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;

    return {
      resultado: null,
      error: apiError?.message ?? 'No se pudo hablar con el asistente. Vuelve a intentarlo.',
      /* 🔴 Se miraba `status === 429`, que es también el del límite de
         peticiones del gateway: un throttle en mitad de una tanda se leía como
         «se te acabó el mes». La cuota tiene código propio desde que habla en
         402. Ver `TemplateDraftState.sinCuota`. */
      sinCuota: apiError?.code === QUOTA_EXCEEDED_CODE,
      cuota: detallesDeCuota(apiError),
    };
  }
}
