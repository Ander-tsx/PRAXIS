import type {
  PlantillaBorradorState,
  PlantillaDeProyecto,
  PlantillaDraftResult,
} from '../api/domain';
import { PLANTILLA_BRIEF_MAX, PLANTILLA_BRIEF_MIN } from '../api/domain';
import { ApiError } from '../api/envelope';
import { createServerApiClient } from '../auth/server-client';

/**
 * Le pide al asistente una plantilla para un proyecto que aún no existe.
 *
 * Una llamada a `POST /me/assistant/project-draft`, que **no crea nada**:
 * devuelve nombres. Quien los materializa es [`aplicarPlantilla`], y solo
 * después de que alguien haya visto el plan y lo haya aceptado.
 *
 * Vive en `commons` y no en cada zona porque el diálogo que la usa también:
 * `projects-front` y `dashboard-front` montan el mismo `CreateProjectDialog`.
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
  ajuste?: { texto: string; previa: PlantillaDeProyecto },
): Promise<PlantillaBorradorState> {
  const texto = brief.trim();

  if (texto.length < PLANTILLA_BRIEF_MIN) {
    return {
      resultado: null,
      error: `Cuéntale un poco más: al menos ${PLANTILLA_BRIEF_MIN} caracteres.`,
      sinCuota: false,
    };
  }

  if (texto.length > PLANTILLA_BRIEF_MAX) {
    return {
      resultado: null,
      error: `Son ${texto.length} caracteres y el máximo es ${PLANTILLA_BRIEF_MAX}.`,
      sinCuota: false,
    };
  }

  try {
    const resultado = await createServerApiClient().post<PlantillaDraftResult>(
      '/me/assistant/project-draft',
      {
        brief: texto,
        /* Solo si los hay: un campo vacío de más es un 400 (CLAUDE.md). El plan
           anterior viaja en JSON — el DTO lo declara como cadena a propósito,
           ver `PLANTILLA_PREVIA_MAX`. */
        ...(ajuste?.texto.trim()
          ? { ajuste: ajuste.texto.trim(), previa: JSON.stringify(ajuste.previa) }
          : {}),
      },
    );

    /* Se confirma contra el `data`, no contra el status: un 200 con una
       plantilla sin espacios no es una plantilla. */
    if (!resultado?.plantilla?.nombre || resultado.plantilla.espacios.length === 0) {
      return {
        resultado: null,
        error: 'El asistente no ha sabido proponer una plantilla. Prueba a contarle algo más.',
        sinCuota: false,
      };
    }

    return { resultado, error: null, sinCuota: false };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;

    return {
      resultado: null,
      error: apiError?.message ?? 'No se pudo hablar con el asistente. Vuelve a intentarlo.',
      sinCuota: apiError?.status === 429,
    };
  }
}
