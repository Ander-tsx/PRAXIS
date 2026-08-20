import {
  createAcademicAutomationAction,
  reviewAcademicAutomationsAction,
} from '@/app/(private)/[id]/actions';
import type { AutomationExecution, AutomationRule } from '@praxis/commons';
import { RuleCard } from './RuleCard';

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
 * El formulario de alta y el panel de ejecuciones son los que ya existían,
 * movidos aquí tal cual — el constructor guiado y la revisión con más detalle
 * llegan en bloques posteriores; este no puede dejar el apartado con menos
 * capacidad de la que tenía.
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
        <div>
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Reglas académicas
          </h2>
          <p className="mt-1 font-sans text-sm text-text-secondary">
            Dos plantillas concretas para la demo, sin colas ni integraciones externas.
          </p>
        </div>

        <form
          action={createAcademicAutomationAction.bind(null, projectId)}
          className="grid gap-3 rounded-xl border border-border p-4"
        >
          <label className="grid gap-1 font-sans text-sm text-text-secondary">
            Nombre
            <input
              required
              minLength={2}
              maxLength={120}
              name="name"
              defaultValue="Avisar tareas próximas a vencer"
              className="rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
            />
          </label>
          <label className="grid gap-1 font-sans text-sm text-text-secondary">
            Tipo
            <select
              name="trigger"
              className="rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
            >
              <option value="TASK_DUE_SOON">Vencimiento próximo → responsables</option>
              <option value="TASK_STALE">Tarea estancada → dueño del proyecto</option>
            </select>
          </label>
          <label className="grid gap-1 font-sans text-sm text-text-secondary">
            Umbral (minutos para vencimiento; días para estancamiento)
            <input
              required
              type="number"
              min={1}
              name="threshold"
              defaultValue={1440}
              className="rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
            />
          </label>
          <label className="flex items-center gap-2 font-sans text-sm text-text-primary">
            <input type="checkbox" name="enabled" defaultChecked /> Activar al crear
          </label>
          <button
            type="submit"
            className="w-fit rounded-lg bg-primary px-4 py-2 font-sans text-sm font-medium text-primary-foreground"
          >
            Crear regla
          </button>
        </form>

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
