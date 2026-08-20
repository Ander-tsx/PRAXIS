import { setAcademicAutomationStatusAction } from '@/app/(private)/[id]/actions';
import { describeRule } from '@/lib/automation-draft';
import { type AutomationRule, Badge } from '@praxis/commons';

export interface RuleCardProps {
  projectId: string;
  rule: AutomationRule;
}

/**
 * Una regla, en su tarjeta.
 *
 * El botón de activar/deshabilitar es el formulario original, sin
 * `useAccion` ni confirmación contra el resultado — es el hueco que llena el
 * Bloque 4 con `RuleStatusToggle`. Se mantiene funcionando mientras tanto
 * para no dejar el apartado con menos capacidad de la que ya tenía.
 */
export function RuleCard({ projectId, rule }: RuleCardProps) {
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-sans text-sm font-medium text-text-primary">{rule.name}</h3>
        <Badge variant={rule.status === 'ENABLED' ? 'success' : 'default'}>
          {rule.status === 'ENABLED' ? 'Activa' : 'Inactiva'}
        </Badge>
      </div>

      <p className="mt-1 font-sans text-xs text-text-secondary">{describeRule(rule)}</p>

      <form
        action={setAcademicAutomationStatusAction.bind(
          null,
          projectId,
          rule.id,
          rule.status === 'ENABLED' ? 'DISABLED' : 'ENABLED',
        )}
        className="mt-3"
      >
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-text-primary"
        >
          {rule.status === 'ENABLED' ? 'Desactivar' : 'Activar'}
        </button>
      </form>
    </li>
  );
}
