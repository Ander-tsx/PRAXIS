'use client';

import type { ReactNode } from 'react';
import type { QuotaExceededDetails, QuotaKind } from '../../billing/planes';
import { fechaCorta } from '../../billing/planes';

/** A dónde lleva «ampliar el plan». Una sola vez, y con el basePath del panel. */
const RUTA_DE_FACTURACION = '/main/billing';

/**
 * Lo que se enseña cuando una escritura no cabe en el plan.
 *
 * ## Por qué esto no es un mensaje de error más
 *
 * 🔴 **Es el sitio exacto donde alguien decide pagar, y hasta ahora era un
 * callejón.** El 402 llegaba con todo lo necesario dentro —qué tope, cuánto es,
 * cuánto llevas— y la pantalla lo pintaba como una línea roja igual que un
 * nombre duplicado: sin decir qué plan lo resuelve y sin un camino hasta él.
 * Quien se topaba con el límite tenía que saber por su cuenta que existe una
 * pantalla de Facturación y encontrarla.
 *
 * Un límite que se agota sin explicación se lee como una avería, que es
 * literalmente la trampa 2 del encargo. Y una avería no se paga: se abandona.
 *
 * ## Cada cuota nombra su propia salida
 *
 * ⚠️ **No se pueden juntar en una frase.** Quien se queda sin proyectos puede
 * borrar uno y seguir hoy mismo, gratis. Quien se queda sin mensajes de IA **no
 * puede hacer nada** hasta el día 1 salvo ampliar, así que lo que necesita
 * delante es la fecha. Y quien se queda sin asientos necesita que alguien salga
 * del equipo, que es otra conversación con otra persona.
 *
 * ## 🔴 Y desde 2026-08-27 tiene dos caras
 *
 * El tope de proyectos se cuenta **por organización**, así que quien ve el
 * mensaje **puede no ser quien puede resolverlo**: en un equipo de diez, nueve
 * no tocan la tarjeta de la empresa. Con `canManageBilling` se ofrece ampliar;
 * sin él, avisar a quien administra — porque un botón de pagar delante de quien
 * no puede pagar se lee como una avería, y una avería no se paga: se abandona.
 *
 * ## Es cliente, y no lleva `Link`
 *
 * Un `<a>` normal y no un `next/link`: en Multi-Zones el panel es **otra
 * aplicación** —`/dashboard` lo sirve `dashboard-front`— y desde `projects-front`
 * un `Link` intentaría una navegación de cliente hacia una ruta que su router no
 * conoce. Es la misma razón por la que la barra lateral enlaza así.
 */
export interface QuotaNoticeProps {
  /** El detalle del 402, ya validado. Ver `detallesDeCuota`. */
  detalle: QuotaExceededDetails;
  /** El mensaje que mandó el gateway. Se enseña tal cual: es el que sabe. */
  mensaje: string;
  /**
   * Si quien mira puede ampliar el plan.
   *
   * ⚠️ **Por defecto `true`, y eso es a propósito**: en las pantallas que
   * todavía no resuelven el permiso, ofrecer la salida y que el servidor decida
   * es mejor que esconderla. Lo que no vale es lo contrario — esconderla a quien
   * sí puede pagar.
   */
  ampliarSirve?: boolean;
  /** Algo más que ofrecer, si el sitio que lo monta tiene una salida propia. */
  accion?: ReactNode;
}

export function QuotaNotice({ detalle, mensaje, ampliarSirve = true, accion }: QuotaNoticeProps) {
  /* Con un `kind` que no conozcamos —un tope nuevo del backend contra una
     pantalla vieja— se cae al texto genérico en vez de reventar el render: el
     mensaje del servidor ya dice qué pasó, y esto solo añade la salida. */
  const salida = (SALIDAS[detalle.kind] ?? SALIDA_GENERICA)(detalle);

  return (
    /* Una raya de color a la izquierda, no una caja de aviso. Es §4 del skill de
       Kyloo: el contenido separa el contenido. Y sobre `--color-*`, que responde
       al tema — no los `--l-*` fijos de la landing (§13). */
    <div role="alert" className="flex flex-col gap-3 border-l-2 border-warning py-1 pl-4">
      <div className="flex flex-col gap-1">
        <p className="font-display text-base text-text-primary">{mensaje}</p>
        <p className="max-w-xl font-sans text-sm text-white">{salida}</p>
      </div>

      {/* El contador, aparte del texto: es el dato que se mira dos veces. */}
      <p className="font-mono text-xs uppercase tracking-wider text-white">
        {detalle.actual} de {detalle.tope} · plan {detalle.tier}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {ampliarSirve ? (
          <a
            href={RUTA_DE_FACTURACION}
            className="font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
          >
            Ver los planes
          </a>
        ) : (
          /* Sin permiso para pagar no se ofrece pagar: se dice a quién pedírselo.
             Es la otra cara de O6.5. */
          <span className="font-sans text-xs text-white">
            Ampliar el plan lo decide quien administra la organización. Pídeselo.
          </span>
        )}
        {accion}
      </div>
    </div>
  );
}

/**
 * Qué puede hacer quien se topa con cada tope, dicho en su propia frase.
 *
 * ⚠️ **Ninguna promete que ampliar lo arregle todo.** La de miembros dice de
 * quién depende el tope, porque es la única de las tres en la que la persona que
 * lee el mensaje puede no ser la que puede resolverlo.
 */
const SALIDA_GENERICA = () => 'Un plan mayor amplía este límite. Los que hay están en Facturación.';

const SALIDAS: Record<QuotaKind, (detalle: QuotaExceededDetails) => string> = {
  /* ⚠️ Dice «la organización» y no «tú»: el tope se cuenta por organización
     desde 2026-08-26, y un «ya tienes tres» a quien no tiene ninguno suyo se lee
     como una avería. */
  proyectos: () =>
    'Se puede borrar un proyecto que ya no se use y crear otro sin pagar nada, o ampliar el plan si hacen falta todos.',
  ia_mensual: (detalle) => {
    const vuelve = fechaCorta(detalle.reiniciaEn ?? null);
    return vuelve
      ? `Los mensajes vuelven a cero el ${vuelve}. Si no puedes esperar, un plan mayor te da más cada mes.`
      : 'Los mensajes vuelven a cero el día 1 del mes que viene. Si no puedes esperar, un plan mayor te da más cada mes.';
  },
  /* Una invitación sin aceptar ocupa asiento, y eso es lo primero que hay que
     mirar: casi siempre sobra alguna. */
  asientos: () =>
    'Cuentan también las invitaciones que nadie ha aceptado todavía: cancelar una libera su asiento. Si están todos ocupados de verdad, hay que ampliar.',
  organizaciones: () =>
    'Pertenecer a las de otros no cuenta: solo las que llevas tú. Un plan mayor deja tener más.',
  automatizaciones: () =>
    'Pausar una regla libera su sitio sin borrarla, y se puede volver a encender cuando haga falta.',
  almacenamiento: () =>
    'Lo que ocupan los adjuntos de toda la organización. Borrar un archivo pesado de una tarea antigua suele bastar.',
};
