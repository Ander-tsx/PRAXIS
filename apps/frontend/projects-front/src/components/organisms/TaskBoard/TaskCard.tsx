'use client';

import {
  PRIORITY_LABELS,
  type Priority,
  type Task,
  type UserProfile,
  alpha,
  checklistProgress,
  colors,
  dueState,
  personLabel,
} from '@praxis/commons';

export interface TaskCardProps {
  task: Task;
  /** Para poner cara a los `userId` de los encargados. */
  usersById: Map<string, UserProfile>;
  onOpen: () => void;
  draggable: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/** Un color por prioridad. Urgente y alta comparten familia, para que se lean juntas. */
const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: colors.textDisabled,
  MEDIUM: colors.info,
  HIGH: colors.warning,
  URGENT: colors.error,
};

/**
 * Una tarea dentro de su columna.
 *
 * Enseña de un vistazo lo que decide si hay que abrirla: prioridad, fecha
 * límite si está cerca o pasada, avance del checklist y quién la lleva. Todo lo
 * demás —descripción, subtareas— vive en el diálogo.
 *
 * Es un `<article>`, no un `<button>` entero: un botón sería ancestro de las
 * iniciales y los contadores, y un botón con contenido estructurado se anuncia
 * fatal en un lector de pantalla.
 *
 * **El diálogo se abre con el icono de configuración, no pulsando la tarjeta.**
 * Antes un botón invisible la cubría entera con `absolute inset-0`, y eso
 * competía con el gesto principal del tablero: un arrastre que se queda en dos
 * píxeles cuenta como clic, y abrías un modal cuando lo que querías era mover la
 * tarjeta. Además no había ninguna pista visual de que la tarjeta se pudiera
 * abrir. Ahora hay un control explícito, y la superficie queda libre para
 * arrastrar y para seleccionar el texto.
 *
 * El icono se ve siempre, tenue, y sube a opacidad plena al pasar por encima o
 * al recibir el foco. Enseñarlo solo en `hover` lo dejaría inalcanzable en una
 * pantalla táctil.
 */
export function TaskCard({
  task,
  usersById,
  onOpen,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const { done, total } = checklistProgress(task);
  const due = dueState(task.dueDate);
  const priorityColor = PRIORITY_COLORS[task.priority];

  return (
    <article
      draggable={draggable}
      onDragStart={(event) => {
        /**
         * Sin esto el arrastre subiría a la columna, que también es
         * `draggable`, y mover una tarjeta acabaría reordenando columnas.
         */
        event.stopPropagation();
        onDragStart();
        try {
          event.dataTransfer.setData('text/plain', task.id);
          event.dataTransfer.effectAllowed = 'move';
        } catch {
          // Sin dataTransfer el arrastre funciona igual; solo cambia el cursor.
        }
      }}
      onDragEnd={(event) => {
        event.stopPropagation();
        onDragEnd();
      }}
      className={[
        'group relative flex flex-col gap-2 rounded-xl bg-background p-3 text-left',
        'transition-[transform,box-shadow,opacity] duration-150 ease-out',
        /* Sin permiso para mover, el cursor no promete nada: la tarjeta ya no se
           pulsa entera, el que abre es el icono. */
        draggable ? 'cursor-grab active:cursor-grabbing' : '',
        isDragging ? 'scale-[1.02] opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ boxShadow: `0 1px 0 ${alpha(colors.border, 40)}` }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: priorityColor }}
          aria-hidden="true"
        />
        <h6 className="min-w-0 flex-1 font-sans text-sm leading-snug text-text-primary">
          {task.title}
        </h6>

        <button
          type="button"
          onClick={onOpen}
          aria-label={`Abrir los detalles de la tarea ${task.title}`}
          title="Detalles de la tarea"
          className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1 text-text-disabled opacity-50 transition-[opacity,color] hover:bg-surface hover:text-text-primary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Las etiquetas van arriba del todo: son el filtro visual con el que se
          barre un tablero, antes que cualquier metadato de la tarea. */}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map(({ label }) => (
            <span
              key={label.id}
              className="rounded px-1.5 py-0.5 font-sans text-[10px] font-medium"
              style={{ background: alpha(colors[label.color], 18), color: colors[label.color] }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip color={priorityColor}>{PRIORITY_LABELS[task.priority]}</Chip>

        {task.dueDate && due !== 'later' && (
          <Chip color={due === 'overdue' ? colors.error : colors.warning}>
            {due === 'overdue' ? 'Venció ' : 'Vence '}
            {formatDue(task.dueDate)}
          </Chip>
        )}

        {total > 0 && (
          <Chip color={done === total ? colors.success : colors.textSecondary}>
            {done}/{total}
          </Chip>
        )}

        {task.subtasks.length > 0 && (
          <Chip color={colors.textSecondary}>
            {task.subtasks.length} {task.subtasks.length === 1 ? 'subtarea' : 'subtareas'}
          </Chip>
        )}
      </div>

      {task.assignees.length > 0 && (
        <div className="flex items-center -space-x-1.5">
          {task.assignees.slice(0, 4).map((assignee) => {
            const user = usersById.get(assignee.userId);
            const label = user ? personLabel(user) : 'Alguien que ya no está en el proyecto';
            return (
              <span
                key={assignee.id}
                title={label}
                className="flex h-6 w-6 items-center justify-center rounded-full font-sans text-[10px] font-semibold uppercase text-text-primary ring-2 ring-background"
                style={{ background: alpha(colors.primary, 30) }}
              >
                {initials(label)}
              </span>
            );
          })}
          {task.assignees.length > 4 && (
            <span className="pl-3 font-sans text-[11px] text-text-secondary">
              +{task.assignees.length - 4}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Iniciales de una persona: la primera letra de sus dos primeras palabras.
 *
 * Cortar los dos primeros caracteres del nombre parecía equivalente y no lo es:
 * «Andres Praxis» y «Andrea Ruiz» daban las dos «AN» y quedaban indistinguibles
 * en la misma tarjeta. Con una sola palabra —el caso de quien no ha puesto
 * nombre y cae al correo— sí se usan sus dos primeras letras.
 */
function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 font-sans text-[10px] font-medium tabular-nums"
      style={{ background: alpha(color, 15), color }}
    >
      {children}
    </span>
  );
}

/**
 * Fecha corta y en palabras cuando está cerca.
 *
 * «hoy» y «mañana» se leen más rápido que un `31 jul`, que es justo lo que hace
 * falta en algo que se mira de reojo.
 */
function formatDue(iso: string): string {
  const due = new Date(iso);
  const today = new Date();
  const diff = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86_400_000,
  );

  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff < 0) return `hace ${Math.abs(diff)} d`;
  if (diff < 7) return `en ${diff} d`;
  return due.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
