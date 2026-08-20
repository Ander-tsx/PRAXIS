import { describeConditions, describeRule } from '@/lib/automation-draft';
import { type AutomationRule, Badge } from '@praxis/commons';
import { DeleteRuleButton } from './DeleteRuleButton';
import { RuleDialog } from './RuleDialog';
import { RuleStatusToggle } from './RuleStatusToggle';

export interface RuleCardProps {
  projectId: string;
  rule: AutomationRule;
  /** Sale de `permissions/me`: sin esto no se enseñan los controles. */
  canManage: boolean;
}

/**
 * Una regla: nombre, estado, resumen legible, condiciones y sus controles.
 *
 * Es **una fila dentro de la caja de la lista**, no una tarjeta con borde
 * propio: la separación entre reglas la pone el `divide-y` del `<ul>` en
 * `ProjectRules`. Cada regla ya lleva dos párrafos y una fila de controles, y
 * meter eso en una caja con borde dentro de otra caja daba tres bordes
 * anidados para una lista.
 */
export function RuleCard({ projectId, rule, canManage }: RuleCardProps) {
  const condiciones = describeConditions(rule);

  return (
    <li className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-sans text-base font-semibold text-text-primary">{rule.name}</h4>
        <Badge variant={rule.status === 'ENABLED' ? 'success' : 'default'}>
          {rule.status === 'ENABLED' ? 'Activa' : 'Inactiva'}
        </Badge>
      </div>

      <p className="mt-1 font-sans text-sm text-text-secondary">{describeRule(rule)}</p>

      {/* Las condiciones, sueltas y en lista. Ya salen dentro de la frase de
          arriba, encadenadas con «y»; con dos o tres hay que leerla entera
          para saber cuándo salta la regla, y esto es lo que se escanea. */}
      <p className="mt-2 font-sans text-sm text-text-secondary">
        {condiciones.length === 0 ? (
          <span className="italic">
            Sin condiciones: se activa con toda tarea que encaje con el disparador.
          </span>
        ) : (
          <>
            <span className="font-medium text-text-primary">Se activa si </span>
            {condiciones.join(' · ')}
          </>
        )}
      </p>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <RuleStatusToggle projectId={projectId} ruleId={rule.id} status={rule.status} />
          <div className="flex items-start gap-2">
            <RuleDialog
              projectId={projectId}
              rule={rule}
              triggerLabel="Editar"
              triggerVariant="ghost"
              triggerSize="sm"
            />
            <DeleteRuleButton projectId={projectId} ruleId={rule.id} ruleName={rule.name} />
          </div>
        </div>
      )}
    </li>
  );
}
