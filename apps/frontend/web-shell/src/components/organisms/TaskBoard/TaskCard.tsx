'use client';

import {
  Avatar,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  type Task,
  type UserProfile,
  alpha,
  avatarHref,
  checklistProgress,
  colors,
  dueState,
  personLabel,
} from '@praxis/commons';
import { useCallback, useRef } from 'react';

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
  /** Con permiso de mover, la tarjeta se puede levantar. */
  draggable: boolean;
  /**
   * Empieza el gesto de arrastre.
   *
   * Es un `pointerdown` y no el `onDragStart` de la API nativa: quien decide si
   * aquello llega a ser un arrastre es `useArrastreDeTablero`, midiendo el
   * recorrido —o el tiempo, en una pantalla táctil—. Ver `arrastre.ts`.
   */
  onArrastrar?: (evento: React.PointerEvent) => void;
  /** Le da el nodo a quien mide: el motor de arrastre y la animación de reposición. */
  registrarNodo?: (el: HTMLElement | null) => void;
  /**
   * Esta copia es el fantasma que sigue al puntero.
   *
   * Cambia dos cosas y ninguna es cosmética: no reacciona al puntero —está
   * debajo de él, no debajo del ratón— y no lleva el borde de «esto se abre»,
   * porque en ese momento no se abre nada.
   */
  fantasma?: boolean;
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
  onArrastrar,
  registrarNodo,
  fantasma = false,
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

  const referencia = useCallback(
    (el: HTMLElement | null) => {
      if (!fantasma) registrarNodo?.(el);
    },
    [fantasma, registrarNodo],
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: el equivalente de teclado es el <button> del título, cuyo click burbujea hasta aquí; poner role="button" en el <article> aplanaría su contenido para un lector de pantalla
    <article
      ref={referencia}
      onPointerDown={(event) => {
        origenDelPuntero.current = { x: event.clientX, y: event.clientY };
        if (draggable && !fantasma) onArrastrar?.(event);
      }}
      onClick={fantasma ? undefined : alPulsar}
      className={[
        'relative flex flex-col gap-2 rounded-xl bg-[#191919] p-3 text-left',
        'transition-[box-shadow,outline-color] duration-150 ease-out',
        fantasma ? 'pointer-events-none w-full' : '',
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
        fantasma
          ? 'outline-2 outline-transparent'
          : 'outline-2 outline-transparent hover:outline-primary has-[:focus-visible]:outline-primary',
        /* Se puede mover: la mano de arrastrar manda sobre el puntero, porque
           describe el gesto que hay que aprender. Sin ese permiso, la tarjeta
           solo se abre y el cursor lo dice. */
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        boxShadow: fantasma
          ? `0 24px 48px -12px ${alpha(colors.overlay, 70)}, 0 0 0 1px ${alpha(colors.primary, 45)}`
          : `0 1px 0 ${alpha(colors.border, 40)}`,
        /* El fantasma **no** se toca con el dedo ni con el ratón: los eventos
           siguen yendo al tablero de debajo, que es quien tiene que saber sobre
           qué columna estás. */
        touchAction: fantasma ? undefined : 'manipulation',
      }}
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
      <h6 className="min-w-0 font-sans text-sm leading-snug text-white">
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
      </div>

      {task.assignees.length > 0 && (
        <div className="flex items-center -space-x-1 mt-1.5">
          {mineFirst(task.assignees, currentUserId)
            .slice(0, 7)
            .map((assignee) => {
              const user = usersById.get(assignee.userId);
              const label = user ? personLabel(user) : 'Alguien que ya no está en el proyecto';
              const mine = assignee.userId === currentUserId;
              return (
                <Avatar
                  key={assignee.id}
                  size="base"
                  label={label}
                  title={mine ? `${label} — es tuya` : label}
                  src={avatarHref(user?.avatarUrl, '/api/gateway')}
                  mine={mine}
                  ring
                  className={mine ? 'relative z-10' : ''}
                />
              );
            })}
          {task.assignees.length > 7 && (
            <span
              className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#1c1c1b] font-sans text-[11px] font-medium text-white ring-2 ring-[#131312]"
              title={`${task.assignees.length - 7} más`}
            >
              +{task.assignees.length - 7}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Pone tu usuario primero para que lo encuentres rápido.
 * Ahora también los ordena alfabéticamente por ID para que no salten de posición en cada render.
 */
function mineFirst<T extends { userId: string }>(assignees: T[], currentUserId: string): T[] {
  const sorted = [...assignees].sort((a, b) => a.userId.localeCompare(b.userId));
  const index = sorted.findIndex((assignee) => assignee.userId === currentUserId);
  if (index <= 0) return sorted;
  return [sorted[index], ...sorted.slice(0, index), ...sorted.slice(index + 1)];
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
