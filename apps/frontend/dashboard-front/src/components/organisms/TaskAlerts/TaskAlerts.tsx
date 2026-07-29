import {
  PRIORITY_LABELS,
  type Priority,
  type Project,
  type Task,
  alpha,
  checklistProgress,
  colors,
} from '@praxis/commons';

export interface TaskAlertsProps {
  /** Vencidas: la fecha ya pasó. */
  overdue: Task[];
  /** Vencen dentro de la ventana próxima. */
  soon: Task[];
  /** Para poder nombrar el proyecto de cada tarea y enlazarlo. */
  projectsById: Map<string, Project>;
  /** Días que abarca «vence pronto», para poder decirlo. */
  soonDays: number;
}

/**
 * Avisos de tareas del panel.
 *
 * **Vencidas y «vencen pronto» van en dos bloques separados, nunca en un
 * contador único.** Son cosas distintas: una ya es un problema y la otra es una
 * advertencia, y sumarlas en un solo número obliga a abrir para saber cuál de
 * las dos te ha tocado. Por eso también el color es distinto, y las vencidas
 * van primero.
 *
 * Todo sale de `GET /me/tasks`, que solo devuelve tareas de proyectos donde
 * sigues estando: no aparecen las de un proyecto del que ya saliste.
 */
export function TaskAlerts({ overdue, soon, projectsById, soonDays }: TaskAlertsProps) {
  if (overdue.length === 0 && soon.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {overdue.length > 0 && (
        <AlertGroup
          tone={colors.error}
          title={
            overdue.length === 1
              ? 'Una tarea tuya venció'
              : `${overdue.length} tareas tuyas vencieron`
          }
          hint="La fecha límite ya pasó."
          tasks={overdue}
          projectsById={projectsById}
        />
      )}

      {soon.length > 0 && (
        <AlertGroup
          tone={colors.warning}
          title={
            soon.length === 1
              ? 'Una tarea tuya vence pronto'
              : `${soon.length} tareas tuyas vencen pronto`
          }
          hint={`En los próximos ${soonDays} días.`}
          tasks={soon}
          projectsById={projectsById}
        />
      )}
    </div>
  );
}

function AlertGroup({
  tone,
  title,
  hint,
  tasks,
  projectsById,
}: {
  tone: string;
  title: string;
  hint: string;
  tasks: Task[];
  projectsById: Map<string, Project>;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-2xl p-5"
      style={{ background: alpha(tone, 7), boxShadow: `inset 3px 0 0 ${tone}` }}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl text-text-primary">{title}</h3>
        <p className="font-sans text-sm text-text-secondary">{hint}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {tasks.map((task) => {
          const project = projectsById.get(task.projectId);
          const { done, total } = checklistProgress(task);

          return (
            <li key={task.id}>
              {/**
               * Enlace duro con `<a>` y no `next/link`: el panel es una zona y
               * el proyecto otra, así que es una navegación entre apps del
               * multi-zone y `next/link` le añadiría el basePath del panel.
               */}
              <a
                href={`/projects/${task.projectId}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated"
              >
                <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
                  {task.title}
                </span>

                <span
                  className="rounded-full px-2 py-0.5 font-sans text-[11px]"
                  style={{ background: alpha(tone, 15), color: tone }}
                >
                  {formatDueDate(task.dueDate)}
                </span>

                <span
                  className="rounded-full px-2 py-0.5 font-sans text-[11px]"
                  style={{
                    background: alpha(PRIORITY_COLORS[task.priority], 15),
                    color: PRIORITY_COLORS[task.priority],
                  }}
                >
                  {PRIORITY_LABELS[task.priority]}
                </span>

                {total > 0 && (
                  <span className="font-sans text-[11px] tabular-nums text-text-secondary">
                    {done}/{total}
                  </span>
                )}

                <span className="truncate font-sans text-xs text-text-disabled">
                  {project?.name ?? 'Proyecto'}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: colors.textDisabled,
  MEDIUM: colors.info,
  HIGH: colors.warning,
  URGENT: colors.error,
};

/** Fecha corta; el «hace» o «en» ya lo da el bloque en el que está. */
function formatDueDate(iso: string | null): string {
  if (!iso) return 'sin fecha';
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
