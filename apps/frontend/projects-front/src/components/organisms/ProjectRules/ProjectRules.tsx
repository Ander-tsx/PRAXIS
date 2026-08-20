import { reviewAcademicAutomationsAction } from '@/app/(private)/[id]/actions';
import type { AutomationExecution, AutomationRule } from '@praxis/commons';
import { RuleCard } from './RuleCard';
import { RuleDialog } from './RuleDialog';

export interface ProjectRulesProps {
  projectId: string;
  rules: AutomationRule[];
  executions: AutomationExecution[];
  /** Sale de `permissions/me`: sin esto no se enseña nada operable. */
  canManage: boolean;
  /** Para distinguir el mensaje de permiso del de suspensión — D8. */
  isSuspended: boolean;
}

/**
 * Reglas de automatización del proyecto.
 *
 * El aviso de suspensión ya se pinta una vez, arriba de toda la página
 * (`SuspendedProjectNotice`): repetirlo aquí sería el mismo texto dos veces.
 * Lo que sí cambia con la suspensión es **qué mensaje se enseña cuando no hay
 * nada operable** — antes decía siempre «no tienes permiso», que es falso
 * cuando la causa real es que el proyecto está suspendido y el mapa de
 * permisos llega recortado por eso, no porque falte un rol.
 *
 * La creación y edición viven en `RuleDialog`, el constructor guiado
 * Cuando/Si/Entonces. El panel de ejecuciones es el que ya existía —la
 * revisión con más detalle llega en un bloque posterior—; este no puede
 * dejar el apartado con menos capacidad de la que tenía.
 */
export function ProjectRules({
  projectId,
  rules,
  executions,
  canManage,
  isSuspended,
}: ProjectRulesProps) {
  if (!canManage) {
    return (
      <p className="rounded-xl border border-border bg-surface p-5 font-sans text-sm text-text-secondary">
        {isSuspended
          ? 'Las reglas de este proyecto no se pueden ver ni administrar mientras esté suspendido.'
          : 'No tienes permiso para administrar automatizaciones en este proyecto.'}
      </p>
    );
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">
              Reglas académicas
            </h2>
            <p className="mt-1 font-sans text-sm text-text-secondary">
              Cuando ocurre algo, si se cumplen las condiciones, entonces se avisa a quien
              corresponda.
            </p>
          </div>
          <RuleDialog projectId={projectId} triggerLabel="Nueva regla" />
        </div>

        {rules.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-6 font-sans text-sm text-text-secondary">
            Aún no hay reglas. Una regla dice cuándo revisar, qué condiciones tienen que cumplirse y
            a quién avisar cuando se cumplen.
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <RuleCard key={rule.id} projectId={projectId} rule={rule} canManage={canManage} />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">Ejecuciones</h2>
            <p className="mt-1 font-sans text-sm text-text-secondary">
              La revisión es manual para que la demo sea determinista.
            </p>
          </div>
          <form action={reviewAcademicAutomationsAction.bind(null, projectId)}>
            <button
              type="submit"
              className="rounded-lg border border-primary px-3 py-2 font-sans text-sm font-medium text-primary"
            >
              Revisar ahora
            </button>
          </form>
        </div>

        {executions.length === 0 ? (
          <p className="font-sans text-sm text-text-secondary">Sin ejecuciones recientes.</p>
        ) : (
          <ul className="space-y-2">
            {executions.map((execution) => (
              <li key={execution.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-sans text-sm font-medium text-text-primary">
                    {execution.rule.name}
                  </p>
                  <span className="font-sans text-xs text-text-secondary">{execution.status}</span>
                </div>
                <time className="mt-1 block font-sans text-xs text-text-secondary">
                  {new Date(execution.createdAt).toLocaleString('es-MX')}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
