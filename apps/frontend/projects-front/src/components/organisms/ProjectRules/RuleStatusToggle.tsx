'use client';

import { toggleAutomationRuleAction } from '@/app/(private)/[id]/actions';
import { AUTOMATION_RULE_INITIAL_STATE } from '@/lib/action-state';
import { Button, alpha, colors, useAccion } from '@praxis/commons';

export interface RuleStatusToggleProps {
  projectId: string;
  ruleId: string;
  /** `ENABLED`/`DISABLED` son los únicos que el cliente puede mandar de vuelta. */
  status: string;
}

/**
 * Activa o desactiva una regla, con espera y error visibles.
 *
 * Reemplaza el formulario crudo del Bloque 3: aquel funcionaba pero no medía
 * su propia espera ni mostraba un error si el `PATCH` fallaba — se quedaba
 * tal cual estaba, sin decir por qué.
 */
export function RuleStatusToggle({ projectId, ruleId, status }: RuleStatusToggleProps) {
  const [state, formAction, pending] = useAccion(
    toggleAutomationRuleAction,
    AUTOMATION_RULE_INITIAL_STATE,
  );
  const enabled = status === 'ENABLED';
  const nextStatus = enabled ? 'DISABLED' : 'ENABLED';

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="ruleId" value={ruleId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <Button type="submit" variant="secondary" size="sm" isLoading={pending} className="w-fit">
        {enabled ? 'Desactivar' : 'Activar'}
      </Button>
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border px-2 py-1.5 font-sans text-xs text-error"
          style={{ background: alpha(colors.error, 10), borderColor: alpha(colors.error, 30) }}
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
