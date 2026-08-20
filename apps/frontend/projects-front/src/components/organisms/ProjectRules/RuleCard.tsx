'use client';

import type { AutomationCatalog, OpcionesDelProyecto } from '@/lib/automation-catalog';
import { describeConditions, describeRule } from '@/lib/automation-draft';
import { type AutomationRule, Badge, Button } from '@praxis/commons';
import { Clock, Zap } from 'lucide-react';
import { DeleteRuleButton } from './DeleteRuleButton';
import { RuleBuilder } from './RuleBuilder';
import { RuleStatusToggle } from './RuleStatusToggle';

export interface RuleCardProps {
  projectId: string;
  rule: AutomationRule;
  catalog: AutomationCatalog | null;
  proyecto: OpcionesDelProyecto;
  /** Sale de `permissions/me`: sin esto no se enseñan los controles. */
  canManage: boolean;
  editando: boolean;
  onEditar: () => void;
  onCerrarEdicion: () => void;
}

/**
 * Una regla: nombre, estado, qué hace en una frase, y sus controles.
 *
 * Es **una fila dentro de la caja de la lista**, no una tarjeta con borde
 * propio: la separación la pone el `divide-y` del `<ul>`. Meter una caja con
 * borde dentro de otra caja daba tres bordes anidados para una lista.
 *
 * ⚠️ **Editar despliega el constructor aquí mismo**, debajo de la regla, en vez
 * de abrir un modal. Así se ve contra qué se está editando y las demás reglas
 * siguen a la vista — que es justo lo que se mira cuando se ajusta una.
 */
export function RuleCard({
  projectId,
  rule,
  catalog,
  proyecto,
  canManage,
  editando,
  onEditar,
  onCerrarEdicion,
}: RuleCardProps) {
  const condiciones = describeConditions(catalog, rule, proyecto);
  const trigger = catalog?.triggers.find((uno) => uno.type === rule.trigger.type);
  const pausada = rule.status === 'PAUSED_SYSTEM';

  return (
    <li className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* El rayo o el reloj dicen de un vistazo lo que más importa saber de
              una regla: si actúa sola o solo cuando revisas. */}
          {trigger && (
            <span
              aria-hidden
              className={trigger.kind === 'reactive' ? 'text-primary' : 'text-text-disabled'}
              title={trigger.kind === 'reactive' ? 'Actúa sola' : 'Actúa al revisar'}
            >
              {trigger.kind === 'reactive' ? (
                <Zap className="size-4" />
              ) : (
                <Clock className="size-4" />
              )}
            </span>
          )}
          <h4 className="font-sans text-base font-semibold text-text-primary">{rule.name}</h4>
        </div>
        <Badge variant={rule.status === 'ENABLED' ? 'success' : pausada ? 'warning' : 'default'}>
          {rule.status === 'ENABLED' ? 'Activa' : pausada ? 'Pausada' : 'Inactiva'}
        </Badge>
      </div>

      {/**
       * ⚠️ **Una regla pausada por el sistema tiene que decir por qué.**
       *
       * `PAUSED_SYSTEM` lo pone el motor cuando quien creó la regla pierde el
       * permiso que una de sus acciones necesita. Sin este texto, la regla se ve
       * apagada y quien la mire pensará que alguien la desactivó a mano — y la
       * volverá a activar para que se vuelva a pausar en la siguiente ejecución.
       */}
      {pausada && rule.pauseReason && (
        <p className="mt-2 rounded-lg bg-warning-muted px-3 py-2 font-sans text-sm text-warning">
          {rule.pauseReason}
        </p>
      )}

      <p className="mt-1 font-sans text-sm text-text-secondary">
        {describeRule(catalog, rule, proyecto)}
      </p>

      {/* Las condiciones, sueltas y en lista. Ya salen dentro de la frase de
          arriba encadenadas con «y»; con dos o tres hay que leerla entera para
          saber cuándo salta, y esto es lo que se escanea. */}
      <p className="mt-2 font-sans text-sm text-text-secondary">
        {condiciones.length === 0 ? (
          <span className="italic">
            Sin condiciones: actúa sobre toda tarea que encaje con el disparador.
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
            <Button
              variant="ghost"
              size="sm"
              onClick={editando ? onCerrarEdicion : onEditar}
              aria-expanded={editando}
            >
              {editando ? 'Cerrar' : 'Editar'}
            </Button>
            <DeleteRuleButton projectId={projectId} ruleId={rule.id} ruleName={rule.name} />
          </div>
        </div>
      )}

      {editando && catalog && (
        <div className="animate-desplegar-panel mt-4">
          <div>
            <RuleBuilder
              projectId={projectId}
              catalog={catalog}
              proyecto={proyecto}
              rule={rule}
              onClose={onCerrarEdicion}
            />
          </div>
        </div>
      )}
    </li>
  );
}
