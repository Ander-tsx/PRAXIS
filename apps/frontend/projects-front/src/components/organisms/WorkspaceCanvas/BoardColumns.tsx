'use client';

import { moveTaskAction, reorderColumnsAction } from '@/app/(private)/[id]/actions';
import { COLUMN_INITIAL_STATE, TASK_INITIAL_STATE } from '@/lib/action-state';
import {
  type Board,
  type Column,
  type ColumnColor,
  DONE_COLUMN_COLOR,
  type Label,
  type Task,
  type UserProfile,
  alpha,
  colors,
  useAccion,
} from '@praxis/commons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ColumnTasks } from '../TaskBoard/ColumnTasks';
import { TaskDialog } from '../TaskBoard/TaskDialog';
import { TaskCard } from '../TaskBoard/TaskCard';
import { CURVA } from '../TaskBoard/arrastre';
import { repartirPorColumna, useMovimientosOptimistas } from '../TaskBoard/movimientos';
import { useArrastreDeTablero } from '../TaskBoard/useArrastreDeTablero';
import { TaskMobileMoveSheet } from '../TaskBoard/TaskMobileMoveSheet';
import { useReposicionAnimada } from '../TaskBoard/useReposicionAnimada';
import { AddColumnCard } from './AddColumnCard';
import { ColumnMenu } from './ColumnMenu';
import { MinimizarIcono } from './TableroExpandible';
import { BOARD_SURFACE } from './superficie-tablero';

export interface BoardColumnsProps {
  board: Board;
  projectId: string;
  /**
   * Crear columnas. Es `canCreateColumn`, no `canCreateBoard` como estaba:
   * gatearlo con el de tableros ocultaba el botón a quien sí podía usarlo.
   */
  canCreateColumn: boolean;
  /** Renombrar y recolorear: `canEditColumn`. */
  canEditColumn: boolean;
  /** Eliminar una columna, y con ella sus tareas: `canDeleteColumn`. */
  canDeleteColumn: boolean;
  /** Tareas del tablero, ya cargadas por la page. */
  tasks: Task[];
  /** Gente del proyecto: a quién se puede asignar. */
  members: UserProfile[];
  /** Etiquetas del proyecto: las que se pueden poner. */
  labels: Label[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  canCreateTask: boolean;
  /**
   * Tarea que hay que abrir nada más entrar, si llega en la URL.
   *
   * Viene de un aviso del panel: aterrizar en el tablero correcto y tener que
   * buscar la tarjeta a ojo deja el trabajo a medias.
   */
  openTaskId?: string | null;
  /** Arrastrar una tarjeta a otra columna: `canMoveTask`, no `canEditTask`. */
  canMoveTask: boolean;
  /** Comentar en una tarea: `canComment`, no `canEditTask`. */
  canComment: boolean;
  /** Gestionar las etiquetas del proyecto desde el diálogo de tarea: `canManageLabels`. */
  canManageLabels: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
}

/**
 * Reparto por posición, solo como red de seguridad.
 *
 * Era la fuente del color hasta que `BoardColumn.color` existió, y tenía el
 * defecto de asignar **por índice**: reordenar una columna le cambiaba el color.
 * Hoy el color viene de la base y viaja con la columna; esto solo cubre el caso
 * de un valor que no reconozcamos, que no debería llegar.
 */
const COLUMN_TINTS = [colors.primary, colors.accent, colors.info, colors.success, colors.warning];

function tintOf(color: ColumnColor, index: number): string {
  return colors[color] ?? COLUMN_TINTS[index % COLUMN_TINTS.length];
}

/**
 * Las columnas de un tablero, y todo lo que se arrastra dentro de ellas.
 *
 * ## Lo que cambió, y por qué importa
 *
 * Este componente hacía dos cosas mal, y las dos se notaban en la mano:
 *
 * 1. 🔴 **Soltar una tarjeta no la movía; se lo pedía al servidor y esperaba.**
 *    La tarjeta volvía a su columna de origen y ahí se quedaba hasta que la
 *    petición terminaba y la página revalidaba entera. En una red normal eso es
 *    medio segundo de una tarjeta deshaciendo lo que acabas de hacer, y luego un
 *    salto. Ahora el movimiento **se aplica en el cliente al soltar** y solo se
 *    deshace si el servidor lo rechaza. Ver `TaskBoard/movimientos.ts`.
 * 2. **El gesto era el arrastre nativo del navegador.** Fantasma que no se puede
 *    animar, eventos a saltos, nada en pantallas táctiles y —lo peor— un destino
 *    que solo sabía decir «encima de esta columna», así que toda tarjeta soltada
 *    aterrizaba al final. Ahora el gesto se calcula midiendo, y cae **en el hueco
 *    exacto** que enseña el propio tablero mientras arrastras. Ver
 *    `TaskBoard/arrastre.ts`.
 *
 * ## Cómo encajan las piezas
 *
 * | Pieza | De qué se ocupa |
 * |---|---|
 * | `useArrastreDeTablero` | El gesto: qué viaja, dónde caería, autodesplazamiento |
 * | `useMovimientosOptimistas` | Que la pantalla vaya por delante del servidor, y sepa volver |
 * | `useReposicionAnimada` | Que nada aparezca ni desaparezca de golpe |
 *
 * Este componente solo las conecta y decide **qué se guarda**: eso es lo único
 * que no puede vivir en un hook genérico, porque depende del contrato del
 * backend —`status` es el nombre de la columna, el `order` no lo reindexa nadie—.
 *
 * ## El reordenado de columnas sigue siendo en vivo
 *
 * Al pasar por encima de otra columna se abre el hueco donde va a caer, y se
 * guarda al soltar: un arrastre largo son muchos cruces y no tiene sentido
 * mandar una petición por cada uno. Lo que cambió es que la columna arrastrada
 * ya no se intercambia con sus vecinas, sino que **sale de la fila** y deja un
 * hueco — con el intercambio, mover una columna tres puestos repintaba tres
 * veces todo su contenido.
 */
export function BoardColumns({
  board,
  projectId,
  canCreateColumn,
  canEditColumn,
  canDeleteColumn,
  tasks,
  members,
  labels,
  usersById,
  currentUserId,
  canCreateTask,
  canMoveTask,
  openTaskId,
  canComment,
  canManageLabels,
  canEditTask,
  canDeleteTask,
}: BoardColumnsProps) {
  const [columns, setColumns] = useState<Column[]>(() =>
    [...board.columns].sort((a, b) => a.order - b.order),
  );

  const [openTask, setOpenTask] = useState<Task | null>(
    () => tasks.find((task) => task.id === openTaskId) ?? null,
  );

  const [renderedTask, setRenderedTask] = useState<Task | null>(openTask);

  const handleCloseTask = useCallback(() => {
    setOpenTask(null);
  }, []);

  useEffect(() => {
    if (openTask) setRenderedTask(openTask);
  }, [openTask]);

  useEffect(() => {
    if (!openTask) return;
    const fresh = tasks.find((task) => task.id === openTask.id);
    if (fresh && fresh !== openTask) setOpenTask(fresh);
    if (!fresh) setOpenTask(null);
  }, [tasks, openTask]);

  /**
   * Columna con el menú abierto. Mientras lo esté, esa columna no se arrastra.
   *
   * Dentro del menú hay un campo de renombrar, y un `pointerdown` que empieza un
   * arrastre le roba el gesto de colocar el cursor.
   */
  const [menuOpenColumnId, setMenuOpenColumnId] = useState<string | null>(null);

  /** Columna abierta a pantalla completa, si hay alguna. */
  const [columnaExpandidaId, setColumnaExpandidaId] = useState<string | null>(null);

  /** Tarea de la que se abrió el menú de mover en versión móvil. */
  const [mobileMenuTask, setMobileMenuTask] = useState<{ id: string; columnId: string } | null>(null);

  const [moveState, moveAction] = useAccion(moveTaskAction, TASK_INITIAL_STATE);
  const [reorderState, reorderAction] = useAccion(reorderColumnsAction, COLUMN_INITIAL_STATE);

  const { movimientos, registrar, confirmar, revertir } = useMovimientosOptimistas(tasks);
  const reposicion = useReposicionAnimada();

  const tasksByColumn = repartirPorColumna(tasks, movimientos);

  /**
   * A qué tarea corresponde cada respuesta.
   *
   * `useAccion` devuelve **un** estado, no uno por llamada, así que con dos
   * movimientos seguidos no habría forma de saber cuál acaba de fallar. Las
   * acciones del router se procesan en el orden en que se despachan, así que una
   * cola FIFO basta: el resultado que llega es el de la cabeza.
   */
  const colaDeMovimientos = useRef<string[]>([]);
  const ultimoResultado = useRef(moveState);

  useEffect(() => {
    if (moveState === ultimoResultado.current) return;
    ultimoResultado.current = moveState;

    const taskId = colaDeMovimientos.current.shift();
    if (!taskId) return;

    if (moveState.error) revertir(taskId);
    else confirmar(taskId);
  }, [moveState, revertir, confirmar]);

  /**
   * El servidor manda: cuando la página revalida, el orden que llega sustituye
   * al local. Sin esto, un fallo al guardar dejaría la pantalla mintiendo.
   */
  useEffect(() => {
    setColumns([...board.columns].sort((a, b) => a.order - b.order));
  }, [board.columns]);

  /* ─── El gesto ───────────────────────────────────────────────────────── */

  const guardarMovimiento = useCallback(
    (
      taskId: string,
      destino: { columnId: string; indice: number },
      cajaDelFantasma: DOMRect | null,
    ) => {
      const task = tasks.find((candidata) => candidata.id === taskId);
      const columnaDestino = columns.find((column) => column.id === destino.columnId);
      if (!task || !columnaDestino) return;

      const actual = tasksByColumn.get(task.columnId) ?? [];
      const posicionActual = actual.findIndex((candidata) => candidata.id === taskId);
      const enLaMismaColumna = (tasksByColumn.get(destino.columnId) ?? []).some(
        (candidata) => candidata.id === taskId,
      );

      /* Soltar donde ya estaba no es un movimiento. Sin esta salida, cada
         arrastre que se arrepiente a mitad manda una petición y revalida la
         página entera para dejar todo igual. */
      if (enLaMismaColumna && destino.indice === posicionActual) return;

      /* La tarjeta aterriza donde la dejó la mano y viaja hasta su hueco. */
      reposicion.sembrar(taskId, cajaDelFantasma);

      const sinLaTarea = (tasksByColumn.get(destino.columnId) ?? []).filter(
        (candidata) => candidata.id !== taskId,
      );
      const finales = [...sinLaTarea];
      finales.splice(Math.min(destino.indice, finales.length), 0, task);

      registrar({
        taskId,
        columnId: destino.columnId,
        status: columnaDestino.name,
        indice: destino.indice,
      });

      /**
       * Las que hay que renumerar, y solo esas.
       *
       * ⚠️ El backend escribe el `order` que le mandas y **no reindexa nada**, así
       * que insertar en medio deja dos tareas con el mismo número y su orden
       * relativo pasa a decidirlo el desempate por `createdAt`. Aquí se comparan
       * los `order` que ya hay en pantalla contra la posición final y se manda
       * únicamente la diferencia: soltar al final de una columna —el caso
       * corriente— no genera ninguna.
       */
      const renumerar = finales
        .map((candidata, indice) => ({ candidata, indice }))
        .filter(({ candidata, indice }) => candidata.id !== taskId && candidata.order !== indice)
        .map(({ candidata, indice }) => `${candidata.id}:${indice}`)
        .join(',');

      const datos = new FormData();
      datos.set('projectId', projectId);
      datos.set('taskId', taskId);
      datos.set('columnId', destino.columnId);
      datos.set('status', columnaDestino.name);
      datos.set('order', String(finales.findIndex((candidata) => candidata.id === taskId)));
      datos.set('renumerar', renumerar);

      colaDeMovimientos.current.push(taskId);
      moveAction(datos);
    },
    [tasks, columns, tasksByColumn, projectId, moveAction, registrar, reposicion],
  );

  const guardarOrdenDeColumnas = useCallback(
    (siguiente: Column[]) => {
      const datos = new FormData();
      datos.set('boardId', board.id);
      datos.set('projectId', projectId);
      datos.set('columnIds', siguiente.map((column) => column.id).join(','));
      reorderAction(datos);
    },
    [board.id, projectId, reorderAction],
  );

  /**
   * Coloca una columna en una posición y lo guarda.
   *
   * ⚠️ **El cálculo va fuera de `setColumns`, y no es cuestión de estilo.**
   * Estuvo dentro del actualizador, que parece el sitio natural —ahí tienes el
   * valor bueno— salvo que React ejecuta esa función **durante el render**, y
   * despachar desde ahí una Server Action revienta con `Cannot update action
   * state while rendering`. Salía en la consola en cada arrastre de columna, y
   * el orden se guardaba igual: por eso era fácil no mirarlo.
   */
  const soltarColumna = useCallback(
    (columnId: string, indice: number, cajaDelFantasma: DOMRect | null) => {
      const desde = columns.findIndex((column) => column.id === columnId);
      if (desde === -1) return;

      const siguiente = [...columns];
      const [movida] = siguiente.splice(desde, 1);
      siguiente.splice(Math.min(indice, siguiente.length), 0, movida);

      // Soltarla donde ya estaba no es un cambio, y no cuesta una petición.
      const antes = columns.map((column) => column.id).join(',');
      if (siguiente.map((column) => column.id).join(',') === antes) return;

      reposicion.sembrar(`columna:${columnId}`, cajaDelFantasma);
      setColumns(siguiente);
      guardarOrdenDeColumnas(siguiente);
    },
    [columns, guardarOrdenDeColumnas, reposicion],
  );

  const arrastreDeTablero = useArrastreDeTablero({
    alSoltarTarea: guardarMovimiento,
    alSoltarColumna: soltarColumna,
    alMenuMobile: (taskId, columnId) => {
      if (canMoveTask) {
        setMobileMenuTask({ id: taskId, columnId });
      }
    },
  });

  const {
    arrastre,
    destinoTarea,
    destinoColumna,
    fantasmaRef,
    empezar,
    registrarPista,
    registrarColumna,
    registrarLista,
    registrarTarjeta,
  } = arrastreDeTablero;

  const empezarArrastreDeTarea = useCallback(
    (taskId: string, columnId: string, evento: React.PointerEvent) => {
      if (!canMoveTask) return;
      empezar(evento, { tipo: 'tarea', id: taskId, columnaOrigen: columnId });
    },
    [canMoveTask, empezar],
  );

  /* ─── Pantalla completa de una columna ───────────────────────────────── */

  /** Escape sale de la columna a pantalla completa, y el fondo no se desplaza. */
  useEffect(() => {
    if (!columnaExpandidaId) return;

    function alPulsarTecla(event: KeyboardEvent) {
      /**
       * ⚠️ Solo si no hay un diálogo abierto. Con una tarea abierta encima, el
       * `<dialog>` nativo ya cierra con Escape por su cuenta; si además
       * cerráramos aquí, una sola pulsación se llevaría las dos capas y
       * volverías al tablero sin haberlo pedido.
       */
      if (event.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) return;
      setColumnaExpandidaId(null);
    }

    const desbordeInicial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', alPulsarTecla);

    return () => {
      document.removeEventListener('keydown', alPulsarTecla);
      document.body.style.overflow = desbordeInicial;
    };
  }, [columnaExpandidaId]);

  /** La columna expandida, resuelta contra el orden vivo. */
  const columnaExpandida = columnaExpandidaId
    ? (columns.find((column) => column.id === columnaExpandidaId) ?? null)
    : null;

  /* ─── Pintado ────────────────────────────────────────────────────────── */

  const arrastrandoColumna = arrastre?.tipo === 'columna' ? arrastre : null;
  const columnasVisibles = arrastrandoColumna
    ? columns.filter((column) => column.id !== arrastrandoColumna.id)
    : columns;
  const huecoDeColumna =
    arrastrandoColumna && destinoColumna !== null
      ? Math.min(destinoColumna, columnasVisibles.length)
      : -1;

  /** La tarea que viaja, para pintarla dentro del fantasma. */
  const tareaEnVuelo =
    arrastre?.tipo === 'tarea' ? tasks.find((task) => task.id === arrastre.id) : undefined;
  const columnaEnVuelo =
    arrastre?.tipo === 'columna' ? columns.find((column) => column.id === arrastre.id) : undefined;

  function pintarColumna(column: Column, index: number) {
    const conMenuAbierto = menuOpenColumnId === column.id;
    const deLaColumna = tasksByColumn.get(column.id) ?? [];

    return (
      <div
        key={column.id}
        ref={(el) => {
          registrarColumna(column.id, el);
          reposicion.registrar(`columna:${column.id}`, el);
        }}
        className="flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-surface"
        style={{ boxShadow: `0 1px 0 ${alpha(colors.border, 45)}` }}
      >
        {/**
         * La cabecera **es el asa**, y el resto de la columna no lo es.
         *
         * Antes lo era la columna entera, con dos efectos malos: dentro de un
         * elemento arrastrable no se puede seleccionar texto —había que apagar
         * el arrastre a mano cada vez que se abría el menú de renombrar— y coger
         * una tarjeta empezaba a mover la columna si el gesto se escapaba un
         * píxel. Con el asa acotada aquí, los dos gestos dejan de competir.
         */}
        <header
          onPointerDown={(evento) => {
            if (!canEditColumn || conMenuAbierto) return;
            /* Solo el fondo de la cabecera: sobre un botón, el gesto es del botón. */
            if ((evento.target as HTMLElement).closest('button')) return;
            empezar(evento, { tipo: 'columna', id: column.id });
          }}
          className={[
            'flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-4',
            canEditColumn && !conMenuAbierto ? 'cursor-grab active:cursor-grabbing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full transition-colors"
              style={{ background: tintOf(column.color, index) }}
            />
            <h5 className="truncate font-sans text-sm font-semibold text-text-primary">
              {column.name}
            </h5>
          </span>

          <span className="flex shrink-0 items-center gap-1">
            {/* Reordenar sin arrastrar: el arrastre no llega al teclado ni
                a un lector de pantalla, así que no puede ser la única
                forma de mover una columna. */}
            {canEditColumn && columns.length > 1 && (
              <>
                <NudgeButton
                  direction={-1}
                  disabled={index === 0}
                  columnName={column.name}
                  onClick={() => nudge(column.id, -1)}
                />
                <NudgeButton
                  direction={1}
                  disabled={index === columns.length - 1}
                  columnName={column.name}
                  onClick={() => nudge(column.id, 1)}
                />
              </>
            )}
            <span
              className="rounded-full px-2 py-0.5 font-sans text-[11px] tabular-nums text-text-secondary"
              style={{ background: alpha(colors.border, 60) }}
            >
              {deLaColumna.length}
            </span>
            <ColumnMenu
              boardId={board.id}
              projectId={projectId}
              columnId={column.id}
              columnName={column.name}
              columnColor={column.color}
              taskCount={deLaColumna.length}
              canEdit={canEditColumn}
              canDelete={canDeleteColumn}
              onOpenChange={(isOpen) => setMenuOpenColumnId(isOpen ? column.id : null)}
              onFullscreen={() => setColumnaExpandidaId(column.id)}
            />
          </span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-2 pb-3">
          <ColumnTasks
            projectId={projectId}
            boardId={board.id}
            column={column}
            tasks={deLaColumna}
            members={members}
            labels={labels}
            usersById={usersById}
            currentUserId={currentUserId}
            canCreate={canCreateTask}
            canMove={canMoveTask}
            canComment={canComment}
            canManageLabels={canManageLabels}
            canEdit={canEditTask}
            canDelete={canDeleteTask}
            onOpenTask={setOpenTask}
            arrastre={arrastre}
            destino={destinoTarea}
            alEmpezarArrastre={empezarArrastreDeTarea}
            registrarLista={registrarLista}
            registrarTarjeta={registrarTarjeta}
            registrarReposicion={reposicion.registrar}
            alDesplazar={reposicion.invalidar}
          />
        </div>
      </div>
    );
  }

  /** Mueve una columna un puesto a izquierda o derecha y lo guarda. */
  function nudge(columnId: string, direction: -1 | 1) {
    const from = columns.findIndex((column) => column.id === columnId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= columns.length) return;

    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setColumns(next);
    guardarOrdenDeColumnas(next);
  }

  const aviso = moveState.error ?? reorderState.error;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/**
       * La pista de columnas: **el único desplazamiento horizontal de la
       * pantalla**, y ocupa todo el alto que le den.
       *
       * `items-stretch` es lo que hace que todas las columnas midan lo mismo
       * independientemente de cuántas tareas tengan. Antes eran `items-start` y
       * cada columna medía su contenido: una con dos tareas al lado de una con
       * quince dejaba un escalón de medio metro y el tablero se leía como una
       * gráfica de barras.
       */}
      <div
        ref={registrarPista}
        onScroll={reposicion.invalidar}
        className="scrollbar-slim -mx-1 flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto px-1 pb-1"
      >
        {columnasVisibles.flatMap((column, index) =>
          index === huecoDeColumna
            ? [
                <HuecoDeColumna key="hueco-columna" ancho={arrastrandoColumna?.ancho ?? 288} />,
                pintarColumna(column, index),
              ]
            : [pintarColumna(column, index)],
        )}
        {huecoDeColumna >= columnasVisibles.length && (
          <HuecoDeColumna key="hueco-columna" ancho={arrastrandoColumna?.ancho ?? 288} />
        )}

        {canCreateColumn && (
          <div className="self-start">
            <AddColumnCard boardId={board.id} projectId={projectId} nextOrder={columns.length} />
          </div>
        )}
      </div>

      {/**
       * El aviso de un guardado que falló, **flotando sobre el tablero**.
       *
       * Ocupaba una línea del flujo, así que aparecer y desaparecer empujaba las
       * columnas dos centímetros arriba y abajo. Un error que reorganiza la
       * pantalla al llegar es peor que el error.
       */}
      {aviso && (
        <p
          role="alert"
          className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-lg px-3 py-1.5 font-sans text-xs shadow-lg"
          style={{ background: alpha(colors.error, 15), color: colors.error }}
        >
          {aviso}
        </p>
      )}

      {/**
       * El fantasma: la pieza que sigue al puntero.
       *
       * Va en un portal al `<body>` por una razón muy concreta: cualquier
       * antepasado con `overflow` distinto de `visible` —y aquí hay dos, la pista
       * y la lista de la columna— **recorta** un hijo posicionado, por muy
       * `fixed` que sea. Dentro del árbol, la tarjeta desaparecería en cuanto
       * saliera de su columna.
       */}
      {arrastre &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={fantasmaRef}
            className="pointer-events-none fixed left-0 top-0 z-[60]"
            style={{
              width: arrastre.ancho,
              transform: `translate3d(${arrastre.inicialX}px, ${arrastre.inicialY}px, 0)`,
              willChange: 'transform',
            }}
          >
            <div className="fantasma-alzado">
              {tareaEnVuelo && (
                <TaskCard
                  fantasma
                  task={tareaEnVuelo}
                  usersById={usersById}
                  currentUserId={currentUserId}
                  onOpen={() => undefined}
                  canEdit={canEditTask}
                  isDone={
                    columns.find((column) => column.id === tareaEnVuelo.columnId)?.color ===
                    DONE_COLUMN_COLOR
                  }
                  draggable={false}
                />
              )}

              {columnaEnVuelo && (
                <ColumnaFantasma
                  nombre={columnaEnVuelo.name}
                  tono={tintOf(columnaEnVuelo.color, columns.indexOf(columnaEnVuelo))}
                  tareas={(tasksByColumn.get(columnaEnVuelo.id) ?? []).length}
                />
              )}
            </div>
          </div>,
          document.body,
        )}

      {/**
       * Una columna ocupando la pantalla.
       *
       * Es la misma `ColumnTasks` de la tira, solo que en rejilla: así el
       * diálogo de tarea, el arrastre y el formulario de añadir siguen siendo
       * los de siempre, sin una segunda implementación que se desincronice.
       *
       * ⚠️ **`openTaskId` no se pasa aquí.** Esta instancia convive con la de la
       * tira, y las dos abrirían la tarea que llega en la URL: dos `<dialog
       * open>` apilados sobre la misma tarea, y al cerrar uno queda el otro
       * detrás. La de la tira ya se encarga de ese caso.
       *
       * ⚠️ **Tampoco registra sus nodos en el motor de arrastre.** Serían los
       * mismos ids que los de la tira, que sigue montada debajo, y el registro
       * es un mapa por id: la segunda instancia pisaría las medidas de la
       * primera y el destino se calcularía contra una columna que no se ve.
       */}
      {columnaExpandida && (
        /**
         * ⚠️ **El lienzo de puntos, y la columna encima como una tarjeta de
         * `bg-surface`.** No es adorno: sin él no había contraste ninguno.
         *
         * Esta capa era `bg-background` y las tarjetas de tarea también son
         * `bg-background` — el mismo color exacto. Las tareas no se distinguían
         * del fondo: se leía una lista de textos flotando, y solo el borde de
         * 1 px insinuaba dónde empezaba cada una.
         *
         * Ahora se reproduce la jerarquía del tablero, que ya la tenía resuelta:
         * lienzo con textura al fondo, la columna como superficie elevada encima
         * y las tarjetas sobre ella. Además de verse, se entiende — es la misma
         * columna, agrandada, no otra pantalla.
         */
        <div
          className="fixed inset-0 z-40 flex flex-col gap-4 p-5"
          style={{ ...BOARD_SURFACE, backgroundColor: colors.background }}
        >
          <header className="flex flex-wrap items-center gap-3">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                background: tintOf(columnaExpandida.color, columns.indexOf(columnaExpandida)),
              }}
              aria-hidden="true"
            />
            <h4 className="font-sans text-lg font-semibold text-text-primary">
              {columnaExpandida.name}
            </h4>
            <span className="font-sans text-xs text-text-secondary">
              {board.name} · {(() => {
                const total = tasksByColumn.get(columnaExpandida.id)?.length ?? 0;
                return `${total} ${total === 1 ? 'tarea' : 'tareas'}`;
              })()}
            </span>

            <button
              type="button"
              onClick={() => setColumnaExpandidaId(null)}
              aria-label={`Salir de pantalla completa de la columna ${columnaExpandida.name}`}
              title="Salir de pantalla completa (Esc)"
              className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MinimizarIcono />
              Salir
            </button>
          </header>

          {/* La columna, con la misma superficie y el mismo redondeo que en la
              tira. Es lo que devuelve el contraste a las tarjetas y lo que hace
              que se reconozca como la columna de siempre. */}
          <div
            className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface p-2"
            style={{ boxShadow: `0 1px 0 ${alpha(colors.border, 45)}` }}
          >
            <ColumnTasks
              projectId={projectId}
              boardId={board.id}
              column={columnaExpandida}
              tasks={tasksByColumn.get(columnaExpandida.id) ?? []}
              members={members}
              labels={labels}
              usersById={usersById}
              currentUserId={currentUserId}
              canCreate={canCreateTask}
              canMove={false}
              canComment={canComment}
              canManageLabels={canManageLabels}
              canEdit={canEditTask}
              canDelete={canDeleteTask}
              onOpenTask={setOpenTask}
              arrastre={null}
              destino={null}
              alEmpezarArrastre={() => undefined}
              registrarLista={() => undefined}
              registrarTarjeta={() => undefined}
              registrarReposicion={() => undefined}
              alDesplazar={() => undefined}
              layout="rejilla"
            />
          </div>
        </div>
      )}

      {mobileMenuTask && (
        <TaskMobileMoveSheet
          isOpen={!!mobileMenuTask}
          onClose={() => setMobileMenuTask(null)}
          columns={columns.map((c) => ({ id: c.id, name: c.name }))}
          currentColumnId={mobileMenuTask.columnId}
          onMoveToColumn={(destColId) => {
            const destIndex = tasksByColumn.get(destColId)?.length ?? 0;
            guardarMovimiento(mobileMenuTask.id, { columnId: destColId, indice: destIndex }, null);
          }}
        />
      )}

      {renderedTask && <TaskDialog
        open={!!openTask}
        onClose={handleCloseTask}
        projectId={projectId}
        boardId={board.id}
        task={renderedTask}
        columnId={renderedTask.columnId}
        columnName={columns.find((c) => c.id === renderedTask.columnId)?.name ?? ''}
        members={members}
        labels={labels}
        usersById={usersById}
        currentUserId={currentUserId}
        canToggleChecklist={canMoveTask}
        canComment={canComment}
        canManageLabels={canManageLabels}
        canEdit={canEditTask}
        canDelete={canDeleteTask}
      />}
    </div>
  );
}

/** El sitio que va a ocupar la columna que viaja. Mide lo mismo que ella. */
function HuecoDeColumna({ ancho }: { ancho: number }) {
  return (
    <div
      aria-hidden="true"
      className="h-full shrink-0 rounded-2xl"
      style={{
        width: ancho,
        background: alpha(colors.primary, 8),
        outline: `2px dashed ${alpha(colors.primary, 35)}`,
        outlineOffset: '-2px',
        transition: `width 200ms ${CURVA}`,
      }}
    />
  );
}

/**
 * La columna, resumida, mientras viaja.
 *
 * No lleva sus tareas dentro a propósito: montar una segunda copia de treinta
 * tarjetas por cada arrastre cuesta más que todo lo demás junto, y con la
 * cabecera y el número ya se sabe qué se está moviendo — que es lo único que hay
 * que saber mientras el ojo mira el hueco.
 */
function ColumnaFantasma({
  nombre,
  tono,
  tareas,
}: {
  nombre: string;
  tono: string;
  tareas: number;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl bg-surface px-4 py-4"
      style={{ boxShadow: `0 24px 48px -12px ${alpha(colors.overlay, 70)}` }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tono }} />
        <h5 className="truncate font-sans text-sm font-semibold text-text-primary">{nombre}</h5>
        <span
          className="ml-auto rounded-full px-2 py-0.5 font-sans text-[11px] tabular-nums text-text-secondary"
          style={{ background: alpha(colors.border, 60) }}
        >
          {tareas}
        </span>
      </span>

      {/* Tres trazos que insinúan las tarjetas: el fantasma tiene que parecer
          una columna con cosas dentro, no una cabecera suelta. */}
      <span className="flex flex-col gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((linea) => (
          <span
            key={linea}
            className="h-6 rounded-lg"
            style={{ background: alpha(colors.border, 45 - linea * 12) }}
          />
        ))}
      </span>
    </div>
  );
}

function NudgeButton({
  direction,
  disabled,
  columnName,
  onClick,
}: {
  direction: -1 | 1;
  disabled: boolean;
  columnName: string;
  onClick: () => void;
}) {
  const label = direction === -1 ? 'Mover a la izquierda' : 'Mover a la derecha';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} la columna ${columnName}`}
      title={label}
      className="rounded p-0.5 text-text-disabled transition-colors hover:text-text-primary disabled:opacity-25 disabled:hover:text-text-disabled"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={direction === -1 ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
        />
      </svg>
    </button>
  );
}
