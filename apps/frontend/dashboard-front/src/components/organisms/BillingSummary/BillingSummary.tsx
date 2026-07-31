import { alpha, Badge, colors } from '@praxis/commons';
import { formatoPeriodo, formatoReinicio } from '@/lib/billing';
import type { AssistantQuota } from '@/lib/billing';

export interface BillingSummaryProps {
  /** `null` cuando `GET /me/assistant/quota` falló: assistant-service abajo, no rompe la pantalla. */
  quota: AssistantQuota | null;
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
 * **No hay botón de compra.** Hoy pasar a PRO es un `UPDATE` a mano en
 * `assistant.assistant_subscriptions` — no existe pasarela de pago, así que el
 * botón del plan que no es el tuyo queda desactivado en vez de prometer un
 * checkout que no está.
 *
 * El plan que no es el tuyo **no lleva cifra**: `ASSISTANT_LIMITS` vive en el
 * backend y esta pantalla no tiene forma de saber el límite de PRO si hoy eres
 * FREE sin pedirlo — copiarlo a mano sería el mismo error que ya se evitó en
 * `reports-front/src/lib/assistant.ts`. Cuando ese plan sea el tuyo, sus
 * números reales salen de la misma cuota.
 */
export function BillingSummary({ quota }: BillingSummaryProps) {
  if (!quota) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="font-sans text-sm text-text-secondary">
          No se pudo cargar tu plan del asistente en este momento. Vuelve a intentarlo más tarde.
        </p>
      </div>
    );
  }

  const otro = quota.plan === 'FREE' ? 'PRO' : 'FREE';
  const usado = Math.min(100, Math.round((quota.usados / Math.max(1, quota.limite)) * 100));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
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
      </div>

      <div
        className="flex flex-col gap-4 rounded-2xl border border-dashed p-6"
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
          Aún no disponible
        </button>
      </div>
    </div>
  );
}
