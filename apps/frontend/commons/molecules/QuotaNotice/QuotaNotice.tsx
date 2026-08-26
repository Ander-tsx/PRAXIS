'use client';

import type { ReactNode } from 'react';
import { alpha, colors } from '../../tokens';
import type { QuotaExceededDetails, QuotaKind } from '../../billing/planes';
import { fechaCorta } from '../../billing/planes';

/** A dónde lleva «ampliar el plan». Una sola vez, y con el basePath del panel. */
const RUTA_DE_FACTURACION = '/dashboard/billing';

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
 * ⚠️ **Las tres son distintas y no se pueden juntar en una frase.** Quien se
 * queda sin proyectos puede borrar uno y seguir hoy mismo, gratis. Quien se
 * queda sin mensajes de IA **no puede hacer nada** hasta el día 1 salvo ampliar,
 * así que lo que necesita delante es la fecha. Y quien se queda sin sitio en un
 * tablero depende de que lo saque **otra persona** —puede no ser suyo—, así que
 * ofrecerle «amplía tu plan» a secas sería mandarle a pagar por algo que quizá
 * ni siquiera arregla su caso: el tope lo pone el plan del **dueño** del
 * proyecto.
 *
 * Por eso `ampliarSirve` no es siempre `true`: en `miembros_por_proyecto` el
 * botón solo se ofrece a quien puede hacer algo con él.
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
   * Si ampliar el plan resuelve **este** caso.
   *
   * Por defecto sí. Se pasa `false` cuando quien mira no es el dueño del
   * proyecto que se quedó sin sitio: ahí su plan no pinta nada.
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
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border px-4 py-3"
      style={{
        background: alpha(colors.warning, 8),
        borderColor: alpha(colors.warning, 30),
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="font-sans text-sm font-semibold text-text-primary">{mensaje}</p>
        <p className="font-sans text-sm text-text-secondary">{salida}</p>
      </div>

      {/* El contador, aparte del texto: es el dato que se mira dos veces. */}
      <p className="font-mono text-xs uppercase tracking-wider text-text-disabled">
        {detalle.actual} de {detalle.tope} · plan {detalle.tier}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {ampliarSirve && (
          <a
            href={RUTA_DE_FACTURACION}
            className="inline-flex items-center rounded-lg px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors"
            style={{ background: colors.primary }}
          >
            Ver planes
          </a>
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
  proyectos: () =>
    'Puedes borrar un proyecto que ya no uses y crear otro sin pagar nada, o ampliar el plan si los necesitas todos.',
  ia_mensual: (detalle) => {
    const vuelve = fechaCorta(detalle.reiniciaEn ?? null);
    return vuelve
      ? `Los mensajes vuelven a cero el ${vuelve}. Si no puedes esperar, un plan mayor te da más cada mes.`
      : 'Los mensajes vuelven a cero el día 1 del mes que viene. Si no puedes esperar, un plan mayor te da más cada mes.';
  },
  miembros_por_proyecto: () =>
    'El tope lo pone el plan del dueño del proyecto: o sale alguien del tablero, o ese plan se amplía.',
};
