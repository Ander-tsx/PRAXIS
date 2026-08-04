import {
  PRIORITY_LABELS,
  type Priority,
  type Project,
  type Task,
  alpha,
  checklistProgress,
  colors,
} from '@praxis/commons';
import { NoticePanel } from '@/components/molecules/NoticePanel';

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
 * sigues estando, y con `excludeDone`: una tarea que ya llegó a la columna de
 * cierre no es un pendiente por mucho que su fecha haya pasado.
 */
export function TaskAlerts({ overdue, soon, projectsById, soonDays }: TaskAlertsProps) {
  if (overdue.length === 0 && soon.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {overdue.length > 0 && (
        <NoticePanel
          tone={colors.error}
          icon={<OverdueIcon />}
          /* Con una sola, el título ya lo dice: el número sería la misma
             información dos veces y en un cuerpo enorme. */
          count={overdue.length > 1 ? overdue.length : undefined}
          title={overdue.length === 1 ? 'Una tarea tuya venció' : 'Tareas tuyas vencidas'}
          hint="La fecha límite ya pasó."
        >
          <TaskRows tasks={overdue} tone={colors.error} projectsById={projectsById} />
        </NoticePanel>
      )}

      {soon.length > 0 && (
        <NoticePanel
          tone={colors.warning}
          icon={<SoonIcon />}
          count={soon.length > 1 ? soon.length : undefined}
          title={soon.length === 1 ? 'Una tarea tuya vence pronto' : 'Tareas tuyas por vencer'}
          hint={`En los próximos ${soonDays} días.`}
        >
          <TaskRows tasks={soon} tone={colors.warning} projectsById={projectsById} />
        </NoticePanel>
      )}
    </div>
  );
}

function TaskRows({
  tasks,
  tone,
  projectsById,
}: {
  tasks: Task[];
  tone: string;
  projectsById: Map<string, Project>;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((task) => {
        const project = projectsById.get(task.projectId);
        const { done, total } = checklistProgress(task);

        return (
          <li key={task.id}>
            {/**
             * Enlace duro con `<a>` y no `next/link`: el panel es una zona y el
             * proyecto otra, así que es una navegación entre apps del
             * multi-zone y `next/link` le añadiría el basePath del panel.
             *
             * ⚠️ **Lleva `board` y `task`, no solo el proyecto.** Con el
             * proyecto a secas se aterrizaba siempre en el primer espacio,
             * aunque la tarea viviera en el tercero: el aviso te dejaba en la
             * puerta y a buscar. El `board` deja que la página resuelva qué
             * espacio abrir —solo ella tiene el árbol— y el `task` abre la
             * tarea directamente.
             */}
            <a
              /* El slug sale del mapa de proyectos que ya recibe este
                 componente, así que no cuesta una petición. Si por lo que sea
                 el proyecto no está en el mapa, se cae al UUID: la ruta acepta
                 las dos formas, así que el enlace sigue funcionando —solo se ve
                 más feo. */
              href={`/projects/${projectsById.get(task.projectId)?.slug ?? task.projectId}?board=${task.boardId}&task=${task.id}`}
              className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ background: alpha(colors.border, 30) }}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: tone }}
              />

              <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
                {task.title}
              </span>

              <Chip tone={tone}>{formatDueDate(task.dueDate)}</Chip>
              <Chip tone={PRIORITY_COLORS[task.priority]}>{PRIORITY_LABELS[task.priority]}</Chip>

              {total > 0 && (
                <span className="font-sans text-[11px] tabular-nums text-text-secondary">
                  {done}/{total}
                </span>
              )}

              <span className="flex shrink-0 items-center gap-1 font-sans text-xs text-text-disabled">
                {project?.name ?? 'Proyecto'}
                <span
                  aria-hidden="true"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  →
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 font-sans text-[11px]"
      style={{ background: alpha(tone, 15), color: tone }}
    >
      {children}
    </span>
  );
}

const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: colors.textDisabled,
  MEDIUM: colors.info,
  HIGH: colors.warning,
  URGENT: colors.error,
};

/** Reloj con el aspa: la fecha pasó. */
function OverdueIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

/** Campana: todavía hay tiempo, pero conviene mirarlo. */
function SoonIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

/** Fecha corta; el «hace» o «en» ya lo da el bloque en el que está. */
function formatDueDate(iso: string | null): string {
  if (!iso) return 'sin fecha';
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
