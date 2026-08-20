'use client';

import { reviewAutomationsAction } from '@/app/(private)/[id]/actions';
import { REVIEW_INITIAL_STATE } from '@/lib/action-state';
import { describeExecutionContext, describeReviewSummary } from '@/lib/automation-draft';
import {
  type AutomationExecution,
  type AutomationExecutionStatus,
  Badge,
  type BadgeVariant,
  Button,
  alpha,
  colors,
  useAccion,
} from '@praxis/commons';

export interface RuleExecutionsProps {
  projectId: string;
  executions: AutomationExecution[];
}

const STATUS_LABELS: Record<AutomationExecutionStatus, string> = {
  SUCCEEDED: 'Avisó',
  SKIPPED: 'No cumplía las condiciones',
  FAILED: 'Falló',
  RUNNING: 'En curso',
};

const STATUS_VARIANTS: Record<AutomationExecutionStatus, BadgeVariant> = {
  SUCCEEDED: 'success',
  SKIPPED: 'default',
  FAILED: 'error',
  RUNNING: 'info',
};

const ERROR_MESSAGE_MAX_CHARS = 140;

/** Nombra el panel para quien navega por regiones. Ver `ProjectRules`. */
const ENCABEZADO_EJECUCIONES = 'ejecuciones-de-reglas';

function failureMessage(execution: AutomationExecution): string | null {
  const failed = execution.actionResults?.find((result) => result.status === 'FAILED');
  if (!failed) return null;
  return failed.error.message.length > ERROR_MESSAGE_MAX_CHARS
    ? `${failed.error.message.slice(0, ERROR_MESSAGE_MAX_CHARS)}…`
    : failed.error.message;
}

/**
 * El panel de ejecuciones — Bloque 6.
 *
 * «Revisar ahora» ya no descarta el resumen que confirma el servidor: lo
 * enseña en una frase, sin inventar `skipped` ni `deduped` (el backend no los
 * manda — hueco 4 de `PENDIENTES-BACKEND-AUTOMATIZACION.md`). El detalle de
 * por qué se omitió cada candidata se lee fila por fila, donde `SKIPPED` sí
 * aparece.
 */
export function RuleExecutions({ projectId, executions }: RuleExecutionsProps) {
  const [state, formAction, pending] = useAccion(reviewAutomationsAction, REVIEW_INITIAL_STATE);

  return (
    <div
      aria-labelledby={ENCABEZADO_EJECUCIONES}
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2
            id={ENCABEZADO_EJECUCIONES}
            className="font-display text-lg font-semibold text-text-primary"
          >
            Ejecuciones
          </h2>
          <p className="mt-1 font-sans text-sm text-text-secondary">
            Revisa las últimas ejecuciones de las reglas: qué regla se evaluó, sobre qué caso, si
            avisó y cuándo. La revisión se lanza desde aquí, no corre sola.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="submit" variant="secondary" size="sm" isLoading={pending}>
            Revisar ahora
          </Button>
        </form>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
          style={{ background: alpha(colors.error, 10), borderColor: alpha(colors.error, 30) }}
        >
          {state.error}
        </p>
      )}

      {state.summary && (
        <output
          className="block rounded-lg border px-3 py-2 font-sans text-sm"
          style={{
            background: alpha(colors.info, 8),
            borderColor: alpha(colors.info, 25),
            color: colors.textPrimary,
          }}
        >
          {describeReviewSummary(state.summary)}
        </output>
      )}

      {executions.length === 0 ? (
        <p className="font-sans text-sm text-text-secondary">
          Aún no se ha revisado nada. «Revisar ahora» evalúa las reglas activas contra las tareas
          del proyecto y deja aquí una fila por cada candidata que encontró.
        </p>
      ) : (
        <ul className="space-y-2">
          {executions.map((execution) => {
            const failure = execution.status === 'FAILED' ? failureMessage(execution) : null;
            return (
              <li key={execution.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-sans text-sm font-medium text-text-primary">
                    {execution.rule.name}
                  </p>
                  <Badge variant={STATUS_VARIANTS[execution.status]}>
                    {STATUS_LABELS[execution.status]}
                  </Badge>
                </div>
                <p className="mt-1 font-sans text-xs text-text-secondary">
                  {describeExecutionContext(execution.conditionResult.context)}
                </p>
                {failure && <p className="mt-1 font-sans text-xs text-error">{failure}</p>}
                <time className="mt-1 block font-sans text-xs text-text-secondary">
                  {new Date(execution.createdAt).toLocaleString('es-MX')}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
