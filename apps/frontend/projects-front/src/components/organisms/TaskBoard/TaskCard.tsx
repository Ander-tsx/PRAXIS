'use client';

import {
  Avatar,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
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
  /**
   * Quién está mirando el tablero.
   *
   * Solo se usa para destacar su propia inicial entre los encargados: no
   * decide nada sobre lo que se puede tocar, eso lo dicen los permisos.
   */
  currentUserId: string;
  onOpen: () => void;
  /** Solo cambia cómo se nombra el botón: el diálogo decide qué deja tocar. */
  canEdit: boolean;
  /**
   * La tarea está en una columna de cierre (verde).
   *
   * Cambia lo que la tarjeta cuenta: una tarea entregada **no vence**. Seguir
   * enseñándole «venció hace 2 d» a algo ya terminado es la contradicción que
   * hacía desconfiar del tablero entero.
   */
  isDone: boolean;
  draggable: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/**
 * Una tarea dentro de su columna.
 *
 * Enseña de un vistazo lo que decide si hay que abrirla: prioridad, fecha
 * límite si está cerca o pasada, avance del checklist y quién la lleva. Todo lo
 * demás —descripción, comentarios, adjuntos— vive en el diálogo.
 *
 * **Tu inicial va primera y en rojo.** Es el único color de la tarjeta que no
 * describe la tarea sino a quien la mira, y por eso puede permitirse ser el más
 * fuerte: barrer un tablero buscando lo tuyo era leer cuatro iniciales por
 * tarjeta, todas del mismo violeta.
 *
 * Es un `<article>`, no un `<button>` entero: un botón sería ancestro de las
 * iniciales y los contadores, y un botón con contenido estructurado se anuncia
 * fatal en un lector de pantalla.
 *
 * **El diálogo se abre con el icono, no pulsando la tarjeta.**
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
 *
 * Es un **ojo**, no un engranaje. Un engranaje promete ajustes, y para quien no
 * puede editar tareas el diálogo es exactamente lo contrario: seis campos
 * desactivados que solo se leen. El ojo describe lo único que el botón garantiza
 * —abrir y ver—, y el texto accesible sí distingue los dos casos.
 */
export function TaskCard({
  task,
  usersById,
  currentUserId,
  onOpen,
  canEdit,
  isDone,
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
      {/* Aquí había un punto de color por prioridad, a la izquierda del título.
          Se fue porque **toda** tarea tiene prioridad: el punto no marcaba las
          urgentes, pintaba las cuatro familias a la vez y una columna llena se
          leía como un arcoíris sin jerarquía. La prioridad no se pierde — sigue
          abajo, en su chip, escrita con palabras y con el mismo color. */}
      <div className="flex items-start gap-2">
        <h6 className="min-w-0 flex-1 font-sans text-sm leading-snug text-text-primary">
          {task.title}
        </h6>

        <button
          type="button"
          onClick={onOpen}
          aria-label={
            canEdit
              ? `Ver y editar la tarea ${task.title}`
              : `Ver los detalles de la tarea ${task.title}`
          }
          title={canEdit ? 'Ver y editar' : 'Ver los detalles'}
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
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
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
        {/**
         * Entregada: la píldora verde sustituye a la de vencimiento, no se suma.
         * Con las dos juntas la tarjeta diría «completado» y «venció hace 2 d» a
         * la vez, que es exactamente la confusión que esto viene a quitar.
         *
         * Se decide por el **color de la columna**, no por su nombre, así que
         * funciona con varias columnas de cierre y con cualquier nombre.
         */}
        {isDone ? (
          <Chip color={colors.success}>Completada</Chip>
        ) : (
          task.dueDate &&
          due !== 'later' && (
            <Chip color={due === 'overdue' ? colors.error : colors.warning}>
              {due === 'overdue' ? 'Venció ' : 'Vence '}
              {formatDue(task.dueDate)}
            </Chip>
          )
        )}

        <Chip color={priorityColor}>{PRIORITY_LABELS[task.priority]}</Chip>

        {total > 0 && (
          <Chip color={done === total ? colors.success : colors.textSecondary}>
            {done}/{total}
          </Chip>
        )}

        {/* Había aquí un chip «N subtareas». Se fue con la decisión de **no
            exponer subtareas**: nada en la interfaz puede crear una, así que era
            un contador que siempre dice cero y que promete una función que no
            existe. El backend las soporta; es capacidad heredada que decidimos
            no usar. Ver ESTADO-ACTUAL §24.5. */}
      </div>

      {task.assignees.length > 0 && (
        <div className="flex items-center -space-x-1.5">
          {mineFirst(task.assignees, currentUserId)
            .slice(0, 4)
            .map((assignee) => {
              const user = usersById.get(assignee.userId);
              const label = user ? personLabel(user) : 'Alguien que ya no está en el proyecto';
              const mine = assignee.userId === currentUserId;
              return (
                <Avatar
                  key={assignee.id}
                  label={label}
                  title={mine ? `${label} — es tuya` : label}
                  mine={mine}
                  ring
                  /* Con `-space-x-1.5` los círculos se solapan y el que va
                     después tapa al anterior. Ir primero en el DOM no basta
                     para verse entero: hace falta subirlo de capa. */
                  className={mine ? 'relative z-10' : ''}
                />
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
 * Los encargados, contigo delante.
 *
 * Va antes del `slice(0, 4)` a propósito: con cinco encargados y tú de quinto,
 * ordenar después de cortar te dejaría fuera de la tarjeta justo en el caso en
 * que más falta hace verte. El resto conserva su orden original.
 *
 * Devuelve la lista tal cual si no eres uno de ellos, para no crear un array
 * nuevo en cada render de cada tarjeta ajena — que en un tablero lleno es la
 * mayoría.
 */
function mineFirst<T extends { userId: string }>(assignees: T[], currentUserId: string): T[] {
  const index = assignees.findIndex((assignee) => assignee.userId === currentUserId);
  if (index <= 0) return assignees;
  return [assignees[index], ...assignees.slice(0, index), ...assignees.slice(index + 1)];
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
