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
import { useRef } from 'react';

/**
 * Cuántos píxeles puede desplazarse el puntero entre pulsar y soltar sin que
 * deje de contar como clic.
 *
 * Es lo que separa «abrir la tarea» de «he empezado a arrastrar y me he
 * arrepentido». Cero sería inservible —nadie mantiene el ratón perfectamente
 * quieto, y menos en un trackpad—; demasiado convertiría un arrastre corto en
 * una ventana que se abre sola, que es exactamente lo que teníamos.
 */
const UMBRAL_DE_CLIC = 4;

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
 * **La tarjeta entera abre la tarea, y el borde azul al pasar por encima lo
 * anuncia.**
 *
 * ⚠️ Esto ya se intentó una vez con un botón invisible en `absolute inset-0` y
 * salió mal: competía con el gesto principal del tablero, porque un arrastre
 * que se queda en dos píxeles termina como un clic y abría una ventana cuando
 * lo que querías era mover la tarjeta. Por eso hubo un botón de ojo en medio.
 *
 * Lo que lo hace viable ahora es que el clic se **mide**: se guarda dónde se
 * pulsó y solo se abre si al soltar el puntero sigue a menos de
 * `UMBRAL_DE_CLIC` píxeles. Un arrastre real supera ese umbral en el primer
 * movimiento, así que los dos gestos dejan de pisarse. Se comprueba además que
 * no haya texto seleccionado: arrastrar para copiar un título terminaba
 * abriendo la tarea.
 *
 * **El teclado entra por el título**, que es un `<button>` de verdad. Enter y
 * Espacio sobre él llegan como un `click` con `detail === 0` —no hay puntero
 * detrás—, y ahí el umbral no aplica ni debe: se abre directamente. Así la
 * tarjeta se puede abrir sin ratón sin necesidad de poner `role="button"` en el
 * `<article>`, que aplanaría todo su contenido para un lector de pantalla.
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

  /** Dónde se pulsó, para saber al soltar si aquello fue un clic o un arrastre. */
  const origenDelPuntero = useRef<{ x: number; y: number } | null>(null);

  /**
   * Decide si este clic abre la tarea.
   *
   * `detail === 0` es un clic sin puntero detrás: lo genera el navegador al
   * pulsar Enter o Espacio sobre el botón del título. Ahí no hay distancia que
   * medir y se abre directo.
   */
  function alPulsar(event: React.MouseEvent) {
    if (event.detail !== 0) {
      const origen = origenDelPuntero.current;
      if (!origen) return;

      const recorrido = Math.max(
        Math.abs(event.clientX - origen.x),
        Math.abs(event.clientY - origen.y),
      );
      if (recorrido > UMBRAL_DE_CLIC) return;

      /* Soltar tras seleccionar texto no debe abrir nada: el gesto era copiar
         el título, y perder la selección bajo una ventana modal es peor que no
         hacer nada. */
      const seleccion = window.getSelection();
      if (seleccion && !seleccion.isCollapsed) return;
    }

    onOpen();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: el equivalente de teclado es el <button> del título, cuyo click burbujea hasta aquí; poner role="button" en el <article> aplanaría su contenido para un lector de pantalla
    <article
      onPointerDown={(event) => {
        origenDelPuntero.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={alPulsar}
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
        'relative flex flex-col gap-2 rounded-xl bg-background p-3 text-left',
        'transition-[transform,box-shadow,opacity,outline-color] duration-150 ease-out',
        /**
         * El borde azul al pasar por encima: es la pista de que la tarjeta se
         * abre, que es justo lo que faltaba cuando el gesto vivía en un icono.
         *
         * El grosor está puesto **siempre**, en transparente, y solo cambia el
         * color. Aparecer y desaparecer el `outline` entero movería la tarjeta
         * dos píxeles en cada pasada y haría temblar la columna al recorrerla.
         *
         * `has-[:focus-visible]` lo enciende también cuando el título recibe el
         * foco por teclado, para que quien tabula vea lo mismo que quien apunta.
         */
        'outline-2 outline-transparent hover:outline-primary has-[:focus-visible]:outline-primary',
        /* Se puede mover: la mano de arrastrar manda sobre el puntero, porque
           describe el gesto que hay que aprender. Sin ese permiso, la tarjeta
           solo se abre y el cursor lo dice. */
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
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
      {/**
       * El título es un `<button>`, y es lo único que hace falta para que la
       * tarjeta se pueda abrir sin ratón. No lleva `onClick` propio a
       * propósito: su clic burbujea hasta el `<article>`, que ya sabe decidir.
       * Dárselo también aquí abriría la tarea dos veces por cada pulsación.
       *
       * Sin fondo, sin borde y sin cursor propio: tiene que seguir leyéndose
       * como el título de la tarjeta, no como un control dentro de ella.
       */}
      <h6 className="min-w-0 font-sans text-sm leading-snug text-text-primary">
        <button
          type="button"
          aria-label={
            canEdit
              ? `Ver y editar la tarea ${task.title}`
              : `Ver los detalles de la tarea ${task.title}`
          }
          className="w-full cursor-[inherit] text-left outline-none"
        >
          {task.title}
        </button>
      </h6>

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
