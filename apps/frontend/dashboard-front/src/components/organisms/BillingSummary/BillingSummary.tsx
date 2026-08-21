import Link from 'next/link';
import type { AssistantQuota, EstadoDeFacturacion } from '@/lib/billing';
import { formatoPeriodo, formatoReinicio } from '@/lib/billing';
import { Badge, alpha, colors } from '@praxis/commons';
import { PlanActionButton } from './PlanActionButton';

export interface BillingSummaryProps {
  /** `null` cuando `GET /me/assistant/quota` falló: assistant-service abajo, no rompe la pantalla. */
  quota: AssistantQuota | null;
  /** Qué se puede ofrecer. `null` si no se pudo preguntar: se trata como apagado. */
  billing: EstadoDeFacturacion | null;
}

const PLAN_COPY = {
  FREE: {
    label: 'FREE',
    tagline: 'Para probar el asistente sin compromiso.',
  },
  PRO: {
    label: 'PRO',
    tagline: 'Para equipos que hablan con el asistente todos los días.',
  },
} as const;

/**
 * Plan del asistente de IA: el actual, con sus números reales, y el otro, en
 * palabras.
 *
 * ## El botón de compra
 *
 * Va contra **Stripe Checkout alojado**: la página de la tarjeta la sirve
 * Stripe. Aquí no hay ni un campo de pago, y por eso no hay nada que proteger
 * en esta pantalla.
 *
 * Solo sale si `billing.disponible`, o sea, si el backend tiene claves de
 * Stripe configuradas. En un entorno sin ellas se vuelve al aviso de siempre:
 * **más vale decir que no está a ofrecer un botón que responde 503**.
 *
 * ⚠️ Volver del pago **no cambia nada de esta pantalla por sí mismo**. Quien
 * concede el plan es el webhook de Stripe; esto lee el resultado de
 * `/me/assistant/quota` al renderizarse. Si al volver todavía pone FREE, es que
 * el webhook aún no ha llegado — recargar lo resuelve.
 *
 * El plan que no es el tuyo **no lleva cifra**: `ASSISTANT_LIMITS` vive en el
 * backend y esta pantalla no tiene forma de saber el límite de PRO si hoy eres
 * FREE sin pedirlo — copiarlo a mano sería el mismo error que ya se evitó en
 * `reports-front/src/lib/assistant.ts`. Cuando ese plan sea el tuyo, sus
 * números reales salen de la misma cuota.
 */
export function BillingSummary({ quota, billing }: BillingSummaryProps) {
  if (!quota) {
    /* Sin tarjeta propia: la pone `PanelCard`, y un recuadro dentro de otro
       recuadro para una sola frase es marco de más. */
    return (
      <p className="font-sans text-sm text-text-secondary">
        No se pudo cargar tu plan del asistente en este momento. Vuelve a intentarlo más tarde.
      </p>
    );
  }

  const otro = quota.plan === 'FREE' ? 'PRO' : 'FREE';
  const usado = Math.min(100, Math.round((quota.usados / Math.max(1, quota.limite)) * 100));

  return (
    /**
     * Los dos planes **uno debajo del otro**, no en dos columnas.
     *
     * Estuvieron en `sm:grid-cols-2` cuando esto ocupaba el ancho entero de la
     * pantalla. Hoy vive en la columna estrecha de la rejilla de Configuración,
     * donde dos columnas dejan cada plan en ~260 px y el lema de cada uno se
     * parte en tres líneas. Apilados se leen como lo que son: el tuyo, y el
     * otro.
     */
    <div className="grid gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-5">
        <div className="flex items-center gap-2">
          <h3 className="font-sans text-base font-semibold text-text-primary">
            {PLAN_COPY[quota.plan].label}
          </h3>
          <Badge variant="primary">Tu plan</Badge>
        </div>
        <p className="font-sans text-sm text-text-secondary">{PLAN_COPY[quota.plan].tagline}</p>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between font-sans text-sm">
            <span className="text-text-primary">
              {quota.usados} / {quota.limite} mensajes
            </span>
            <span className="text-text-secondary">{formatoPeriodo(quota.periodo)}</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: colors.borderSubtle }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${usado}%`, background: colors.primary }}
            />
          </div>
        </div>

        <p className="font-sans text-xs text-text-secondary">
          Se reinician el {formatoReinicio(quota.reinicia)}.
        </p>

        {/* Solo para quien ya es cliente de Stripe. Cambiar tarjeta, ver recibos
            y darse de baja se hacen en su portal: reimplementarlo aquí sería
            rehacer prorrateos y reintentos que ya existen ahí. */}
        {billing?.gestionable && (
          <PlanActionButton accion="portal">Gestionar suscripción</PlanActionButton>
        )}
      </div>

      <div
        className="flex flex-col gap-3 rounded-2xl border border-dashed p-5"
        style={{ borderColor: colors.border }}
      >
        <h3 className="font-sans text-base font-semibold text-text-primary">
          {PLAN_COPY[otro].label}
        </h3>
        <p className="font-sans text-sm text-text-secondary">{PLAN_COPY[otro].tagline}</p>
        <p className="font-sans text-sm text-text-secondary">
          {otro === 'PRO'
            ? 'Más conversaciones al mes con el asistente.'
            : 'El plan gratuito, con menos conversaciones al mes.'}
        </p>

        {otro === 'PRO' && billing?.disponible ? (
          <div className="flex flex-col gap-2">
            <PlanActionButton accion="checkout">Pasar a PRO</PlanActionButton>
            {/* El detalle completo —qué incluye cada plan y el precio— vive en
                su propia página. Aquí solo cabe el resumen. */}
            <Link
              href="/dashboard/planes"
              className="font-sans text-xs text-text-secondary underline-offset-2 hover:underline"
            >
              Ver los dos planes en detalle
            </Link>
          </div>
        ) : (
          /**
           * Dos casos distintos con la misma pinta, y es correcto:
           *
           * - Ya eres PRO, así que «el otro» es FREE y bajar de plan se hace
           *   desde el portal de Stripe, no desde aquí.
           * - No hay pasarela configurada en este entorno.
           *
           * En los dos, ofrecer un botón sería prometer algo que no ocurre.
           */
          <button
            type="button"
            disabled
            aria-disabled
            className="mt-auto w-fit rounded-lg px-4 py-2 font-sans text-sm font-medium"
            style={{
              background: alpha(colors.textSecondary, 10),
              color: colors.textDisabled,
            }}
          >
            {otro === 'PRO' ? 'Aún no disponible' : 'Se gestiona desde tu suscripción'}
          </button>
        )}
      </div>
    </div>
  );
}
