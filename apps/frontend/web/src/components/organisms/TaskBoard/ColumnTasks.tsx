'use client';

import { createTaskAction } from '@/app/(privado)/projects/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import type { Column, Label, Task, UserProfile } from '@praxis/commons';
import { DONE_COLUMN_COLOR, alpha, colors, useAccion } from '@praxis/commons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';
import type { ArrastreEnCurso, DestinoDeTarea, Disposicion } from './arrastre';

export interface ColumnTasksProps {
  projectId: string;
  boardId: string;
  column: Column;
  tasks: Task[];
  members: UserProfile[];
  labels: Label[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  canCreate: boolean;
  /** Arrastrar la tarjeta a otra columna: `canMoveTask`. */
  canMove: boolean;
  /** Comentar: `canComment`. Un perfil de solo lectura ya puede responder. */
  canComment: boolean;
  /** Gestionar las etiquetas del proyecto desde el diálogo de tarea: `canManageLabels`. */
  canManageLabels: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onOpenTask: (task: Task) => void;
  /**
   * La tarea que está abierta ahora mismo (viene de la URL, ver `BoardColumns`).
   *
   * Solo se pasa desde la instancia en tira: la de pantalla completa convive
   * con ella y las dos pintarían el mismo reborde, sin aportar nada.
   */
  openTaskId?: string | null;
  /** Qué tarjeta acaba de guardarse, para el brillo. Ver `BoardColumns`. */
  ultimoGuardado?: { taskId: string; nonce: number } | null;
  /**
   * Acaba de crearse una tarea en esta columna.
   *
   * El alta rápida solo pide el título, así que quien la usa casi siempre
   * quiere seguir rellenando el resto. Quien decide qué hacer con eso es el
   * tablero —es quien tiene el panel de detalle y la lista fresca de tareas—,
   * no esta columna.
   */
  onTaskCreated?: (taskId: string) => void;
  /** Lo que viaja ahora mismo por el tablero, si es que viaja algo. */
  arrastre: ArrastreEnCurso | null;
  /** El hueco donde caería. Solo se pinta si es de esta columna. */
  destino: DestinoDeTarea | null;
  alEmpezarArrastre: (taskId: string, columnId: string, evento: React.PointerEvent) => void;
  registrarLista: (columnId: string, el: HTMLElement | null, disposicion: Disposicion) => void;
  registrarTarjeta: (columnId: string, taskId: string, el: HTMLElement | null) => void;
  /** Para la animación de reposición: la clave es el id de la tarea. */
  registrarReposicion: (id: string, el: HTMLElement | null) => void;
  /** Desplazar mueve todas las medidas guardadas: hay que avisar. */
  alDesplazar: () => void;
  /**
   * Cómo se colocan las tarjetas.
   *
   * `columna` es lo de siempre: una tira que ocupa el alto disponible. `rejilla`
   * es para la columna en pantalla completa, donde el ancho sobra y apilar
   * treinta tarjetas en una sola fila desperdiciaría toda la pantalla.
   */
  layout?: Disposicion;
  /** Lo que dice la lista vacía. El backlog no es una columna y no dice «Sin tareas». */
  textoVacio?: string;
}

/**
 * Las tareas de una columna, más el botón de añadir.
 *
 * Es la zona donde cae el arrastre, pero **ya no decide nada sobre él**: quien
 * resuelve en qué hueco encaja la tarjeta es `useArrastreDeTablero`, midiendo.
 * Aquí solo se pinta el resultado —el hueco abierto— y se registran los nodos
 * para que se pueda medir.
 *
 * ⚠️ **La tarjeta que viaja no se pinta en la lista.** Sale de ella y su sitio lo
 * ocupa el hueco, que mide exactamente lo que medía. Dejarla puesta y bajarle la
 * opacidad —que es lo que hacíamos— produce dos copias de la misma tarea a la
 * vez, la de debajo del dedo y la del sitio viejo, y con ellas la duda de cuál
 * de las dos es la de verdad.
 */
export function ColumnTasks({
  projectId,
  boardId,
  column,
  tasks,
  members,
  labels,
  usersById,
  currentUserId,
  canCreate,
  canMove,
  canComment,
  canManageLabels,
  canEdit,
  canDelete,
  onOpenTask,
  openTaskId = null,
  ultimoGuardado = null,
  onTaskCreated,
  arrastre,
  destino,
  alEmpezarArrastre,
  registrarLista,
  registrarTarjeta,
  registrarReposicion,
  alDesplazar,
  layout = 'columna',
  textoVacio = 'Sin tareas',
}: ColumnTasksProps) {
  const enRejilla = layout === 'rejilla';

  /** Columna de cierre: lo que hay dentro está entregado. Ver `DONE_COLUMN_COLOR`. */
  const isDoneColumn = column.color === DONE_COLUMN_COLOR;

  const referenciaDeLista = useCallback(
    (el: HTMLElement | null) => registrarLista(column.id, el, layout),
    [registrarLista, column.id, layout],
  );

  const arrastrandoTarea = arrastre?.tipo === 'tarea' ? arrastre : null;
  const esElDestino = arrastrandoTarea !== null && destino?.columnId === column.id;
  const visibles = arrastrandoTarea
    ? tasks.filter((task) => task.id !== arrastrandoTarea.id)
    : tasks;
  const posicionDelHueco = esElDestino && destino ? Math.min(destino.indice, visibles.length) : -1;

  /** El hueco abierto: mide lo que mide la tarjeta que viaja, ni un píxel más. */
  const hueco = arrastrandoTarea ? (
    <div
      key="hueco"
      aria-hidden="true"
      className="rounded-xl"
      style={{
        height: arrastrandoTarea.alto,
        background: alpha(colors.primary, 10),
        outline: `2px dashed ${alpha(colors.primary, 40)}`,
        outlineOffset: '-2px',
      }}
    />
  ) : null;

  const conHueco: React.ReactNode[] = [];
  visibles.forEach((task, indice) => {
    if (indice === posicionDelHueco) conHueco.push(hueco);
    conHueco.push(
      <TaskCard
        key={task.id}
        task={task}
        usersById={usersById}
        currentUserId={currentUserId}
        onOpen={() => onOpenTask(task)}
        canEdit={canEdit}
        isOpen={task.id === openTaskId}
        shineNonce={ultimoGuardado?.taskId === task.id ? ultimoGuardado.nonce : null}
        isDone={isDoneColumn}
        draggable={canMove}
        onArrastrar={(evento) => alEmpezarArrastre(task.id, column.id, evento)}
        registrarNodo={(el) => {
          registrarTarjeta(column.id, task.id, el);
          registrarReposicion(task.id, el);
        }}
      />,
    );
  });
  if (posicionDelHueco >= visibles.length) conHueco.push(hueco);

  return (
    <>
      <div
        className={[
          /* `px-1` y no `px-2`: los otros 4 px los pone la lista de dentro, que
             los necesita para no recortar el borde de las tarjetas. El ancho
             total no cambia. */
          'flex min-h-0 flex-1 flex-col gap-2 rounded-xl px-1 pb-2 transition-colors duration-200',
        ].join(' ')}
        style={{
          /* La columna destino se tiñe entera: mirando el hueco no se ve el
             borde de la columna, y mirando el borde no se ve el hueco. */
          background: esElDestino ? alpha(colors.primary, 7) : 'transparent',
        }}
      >
        {/**
         * ⚠️ **La lista de tarjetas se desplaza sola, y ocupa el alto que le den.**
         *
         * Tuvo un tope de `55vh` mientras el tablero vivía dentro de una página
         * que también se desplazaba: sin ese tope, una columna con treinta tareas
         * estiraba el tablero y había que recorrer la página entera para llegar
         * al final de una sola columna.
         *
         * Ahora el tablero **es** la pantalla —la página no se desplaza— así que
         * el tope sobra y además estorbaba: dejaba medio lienzo vacío por debajo
         * de las columnas cortas y obligaba a desplazar dentro de una columna que
         * tenía sitio de sobra.
         *
         * El desplazamiento va **aquí y no en la zona de suelta**: así «Añadir
         * tarea» se queda fijo abajo en vez de irse con el scroll, que es lo
         * único que hace falta cuando la columna está llena.
         *
         * `scrollbar-slim`: la barra **sí se ve**, fina y en gris. Estuvo oculta
         * y eso escondía algo que hacía falta saber: una columna con veinte
         * tareas se veía exactamente igual que una con cinco. El contador de la
         * cabecera dice el total, pero no dónde estás dentro de él. El tamaño del
         * pulgar sí.
         *
         * ⚠️ **El relleno de 1 (4 px) es lo que deja ver entero el borde azul de
         * las tarjetas al pasar por encima.** Un contenedor que desborda en un
         * eje **recorta también el otro**: en cuanto `overflow-y` deja de ser
         * `visible`, `overflow-x` no puede seguir siéndolo, así que el `outline`
         * de 2 px de la tarjeta se cortaba limpio por los dos costados.
         */}
        <div
          ref={referenciaDeLista}
          onScroll={alDesplazar}
          className={
            enRejilla
              ? 'scrollbar-slim grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start gap-3 overflow-y-auto p-1'
              : /* ⚠️ **Sin `flex-1`, y es deliberado.** Con él la lista se estiraba
                   hasta abajo del todo y «Añadir tarea» se quedaba pegado al
                   borde de la columna, a media pantalla de la última tarjeta:
                   parecía un pie de la columna y no el final de la lista. Sin
                   él, la lista mide lo que miden sus tarjetas y solo se encoge
                   —y entonces se desplaza— cuando ya no caben. */
                'scrollbar-slim flex min-h-0 flex-col gap-2 overflow-y-auto p-1'
          }
        >
          {visibles.length === 0 && posicionDelHueco < 0 ? (
            <div
              /* En rejilla ocupa el ancho entero: si no, «Sin tareas» sale
                 encajado en una celda de 240 px con la pantalla vacía al lado. */
              className={[
                'flex min-h-24 items-center justify-center rounded-lg',
                enRejilla ? 'col-span-full' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ background: '#191919' }}
            >
              <span className="font-sans text-xs text-white">
                {arrastrandoTarea ? 'Suelta aquí' : textoVacio}
              </span>
            </div>
          ) : (
            conHueco
          )}
        </div>

        {canCreate && (
          <NewTaskInline
            projectId={projectId}
            boardId={boardId}
            columnId={column.id}
            columnName={column.name}
            onCreated={onTaskCreated}
          />
        )}
      </div>

      {/* Se eliminó TaskDialog de aquí para montarlo una sola vez en BoardColumns. */}
    </>
  );
}

/**
 * Crear una tarea desde la propia columna: solo el título.
 *
 * Antes «Añadir tarea» abría el diálogo completo, con descripción, prioridad,
 * fecha, etiquetas y encargados. Para anotar tres cosas seguidas eso es una
 * ventana modal por tarea, y las tareas se apuntan en ráfaga: primero se
 * vuelcan, luego se detallan. El resto se rellena abriendo la tarjeta.
 *
 * Nace con prioridad **media**, que ya es el valor por defecto del backend, así
 * que `priority` no se manda: mandarlo obligaría a mantener aquí un valor que ya
 * está definido en el DTO, y los dos se desincronizarían.
 *
 * Igual que en `AddColumnCard`: el campo se vacía y **mantiene el foco** cuando
 * el servidor confirma, para escribir la siguiente sin tocar el ratón. Vaciarlo
 * al enviar perdería lo escrito si la petición falla.
 */
function NewTaskInline({
  projectId,
  boardId,
  columnId,
  columnName,
  onCreated,
}: {
  projectId: string;
  boardId: string;
  columnId: string;
  /** `status` tiene que igualar el nombre de la columna, no su id. */
  columnName: string;
  onCreated?: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [state, formAction, pending] = useAccion(createTaskAction, TASK_INITIAL_STATE);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!state.done) return;
    setTitle('');
    /**
     * ⚠️ **Al crear se abre el detalle de la tarea, y eso cambia el gesto.**
     *
     * Esto vaciaba el campo y devolvía el foco para escribir la siguiente sin
     * tocar el ratón. Era un buen gesto para vaciar una lista de pendientes,
     * pero dejaba cada tarea con lo único que el alta rápida pide —el título— y
     * sin encargado, sin fecha y sin prioridad; completarlas después obligaba a
     * volver a buscarlas una a una.
     *
     * Ahora se abre el panel con la tarea recién creada. Para encadenar varias
     * sigue bastando con cerrarlo: el formulario se queda abierto y con el foco
     * puesto, así que es una tecla más por tarea, no un camino distinto.
     */
    inputRef.current?.focus();
    onCreated?.(state.done);
  }, [state.done, onCreated]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        /* Invisible hasta que se pasa por la columna entera —`group` va en su
           `<div>`, en `BoardColumns`—, no solo por este botón: así no hace
           falta bajar hasta el fondo de la lista para saber que está ahí.
           `focus-visible` lo enseña igual sin ratón, que si no quedaba
           inalcanzable por teclado con la columna vacía de foco. */
        className="flex shrink-0 w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-xs text-white/45 opacity-0 transition-opacity hover:bg-white/5 hover:text-white focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 max-md:min-h-11 max-md:opacity-100"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Añadir tarea
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex shrink-0 flex-col gap-2 rounded-xl bg-[#1c1c1b] p-2"
      style={{ boxShadow: `0 1px 0 ${alpha(colors.border, 40)}` }}
      noValidate
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="columnId" value={columnId} />
      <input type="hidden" name="status" value={columnName} />

      <input
        ref={inputRef}
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        /* Sin nada escrito, salir del campo cierra: dejar un formulario abierto
           y vacío en la columna solo estorba. */
        onBlur={() => !title.trim() && setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }
          /**
           * Enter envía, explícitamente.
           *
           * Un `<input>` en un formulario con botón de envío ya lo hace solo
           * («implicit submission»), pero aquí es la tecla que sostiene todo el
           * gesto —escribir varias tareas seguidas sin tocar el ratón—, así que
           * no se deja a un comportamiento implícito. `preventDefault` evita que
           * en un navegador normal se envíe dos veces.
           */
          if (event.key === 'Enter' && title.trim() && !pending) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        maxLength={255}
        placeholder="Qué hay que hacer"
        autoComplete="off"
        aria-label={`Título de la tarea nueva en ${columnName}`}
        className="h-9 rounded-lg border border-white/10 bg-[#191919] px-2.5 font-sans text-xs text-white outline-none placeholder:text-white focus:border-primary"
      />

      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={!title.trim() || pending}
          className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: colors.primary }}
        >
          {pending ? 'Creando…' : 'Crear'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-lg px-2 py-1.5 font-sans text-xs text-white transition-colors hover:text-white"
        >
          Cancelar
        </button>
        <span className="ml-auto pr-1 font-sans text-[10px] text-white">Prioridad media</span>
      </div>

      {state.error && (
        <p role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
