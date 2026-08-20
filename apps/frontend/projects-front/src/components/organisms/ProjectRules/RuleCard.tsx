import { describeRule } from '@/lib/automation-draft';
import { type AutomationRule, Badge } from '@praxis/commons';
import { DeleteRuleButton } from './DeleteRuleButton';
import { RuleStatusToggle } from './RuleStatusToggle';

export interface RuleCardProps {
  projectId: string;
  rule: AutomationRule;
  /** Sale de `permissions/me`: sin esto no se enseñan los controles. */
  canManage: boolean;
}

/** Una regla, en su tarjeta: nombre, estado, resumen legible y sus controles. */
export function RuleCard({ projectId, rule, canManage }: RuleCardProps) {
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-sans text-sm font-medium text-text-primary">{rule.name}</h3>
        <Badge variant={rule.status === 'ENABLED' ? 'success' : 'default'}>
          {rule.status === 'ENABLED' ? 'Activa' : 'Inactiva'}
        </Badge>
      </div>

      <p className="mt-1 font-sans text-xs text-text-secondary">{describeRule(rule)}</p>

      {canManage && (
        <div className="mt-3 flex items-start justify-between gap-3">
          <RuleStatusToggle projectId={projectId} ruleId={rule.id} status={rule.status} />
          <DeleteRuleButton projectId={projectId} ruleId={rule.id} ruleName={rule.name} />
        </div>
      )}
    </li>
  );
}
