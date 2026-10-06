'use client';

import { moveTaskAction, reorderColumnsAction } from '@/app/(privado)/projects/[id]/actions';
import { planTaskAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import {
  COLUMN_INITIAL_STATE,
  SPRINT_INITIAL_STATE,
  TASK_INITIAL_STATE,
} from '@/lib/projects/action-state';
import {
  type Board,
  CONSULTA_MOVIL,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ColumnTasks } from '../TaskBoard/ColumnTasks';
import { TaskCard } from '../TaskBoard/TaskCard';
import { TaskDialog } from '../TaskBoard/TaskDialog';
import { TaskMobileMoveSheet } from '../TaskBoard/TaskMobileMoveSheet';
import { CURVA } from '../TaskBoard/arrastre';
import { repartirPorColumna, useMovimientosOptimistas } from '../TaskBoard/movimientos';
import { useArrastreDeTablero } from '../TaskBoard/useArrastreDeTablero';
import { useReposicionAnimada } from '../TaskBoard/useReposicionAnimada';
import { AddColumnCard } from './AddColumnCard';
import { BacklogPanel } from './BacklogPanel';
import { ColumnMenu } from './ColumnMenu';
import { MinimizarIcono } from './TableroExpandible';
import { BACKLOG } from './scrum';
import { BOARD_SURFACE } from './superficie-tablero';

/**
 * Lo que un tablero con Scrum añade a sus columnas: el backlog, que se pinta
 * en un panel lateral pero vive **dentro de este motor de arrastre** como una
 * columna más (D17 de `docs/PLAN-SCRUM-KANBAN.md`).
 */
export interface PlanificacionDelTablero {
  backlog: Task[];
  panelAbierto: boolean;
  onCerrarPanel: () => void;
  /** Sprint al que entra lo que se suelta en una columna. `null`: se crea al soltar. */
  sprintDestino: { id: string; name: string } | null;
  /** Nombre del sprint que se crea si no hay ninguno. */
  nombreNuevo: string;
  /** Pasar tareas entre backlog y sprint es editarlas: `canEditTask`. */
  canPlan: boolean;
}

export interface BoardColumnsProps {
  board: Board;
  projectId: string;
  /** Solo en un tablero con Scrum encendido. */
  planificacion?: PlanificacionDelTablero;
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
  planificacion,
}: BoardColumnsProps) {
  const backlog = planificacion?.backlog;
  /**
   * Las tareas tal como son (para el panel de tarea) y tal como las ve el
   * motor: las del backlog con `columnId = BACKLOG`, para que repartirlas,
   * moverlas en optimista y medir el hueco sea el mismo código para todas.
   */
  const originales = useMemo(() => (backlog ? [...tasks, ...backlog] : tasks), [tasks, backlog]);
  const todas = useMemo(
    () => (backlog ? [...tasks, ...backlog.map((t) => ({ ...t, columnId: BACKLOG }))] : tasks),
    [tasks, backlog],
  );
  const [columns, setColumns] = useState<Column[]>(() =>
    [...board.columns].sort((a, b) => a.order - b.order),
  );

  const [openTask, setOpenTaskCrudo] = useState<Task | null>(
    () => originales.find((task) => task.id === openTaskId) ?? null,
  );
  /* Una tarjeta del backlog llega con `columnId = BACKLOG`; el panel necesita
     la tarea de verdad. */
  const setOpenTask = useCallback(
    (task: Task | null) =>
      setOpenTaskCrudo(task ? (originales.find((t) => t.id === task.id) ?? task) : null),
    [originales],
  );

  const [renderedTask, setRenderedTask] = useState<Task | null>(openTask);

  const handleCloseTask = useCallback(() => {
    setOpenTaskCrudo(null);
  }, []);

  /**
   * Qué tarjeta acaba de guardarse, para el brillo de `TaskCard`.
   *
   * `nonce` y no un booleano: guardar la misma tarea dos veces seguidas —abrir,
   * tocar algo, cerrar; volver a abrir, tocar otra cosa, cerrar— tiene que
   * reproducir el brillo las dos veces, y el mismo `taskId` no cambiaría de
   * valor entre una y otra.
   */
  const [ultimoGuardado, setUltimoGuardado] = useState<{ taskId: string; nonce: number } | null>(
    null,
  );
  const nonceGuardado = useRef(0);
  const handleTaskSaved = useCallback((taskId: string) => {
    nonceGuardado.current += 1;
    setUltimoGuardado({ taskId, nonce: nonceGuardado.current });
  }, []);

  /**
   * La tarea que se acaba de crear y todavía no ha llegado en `tasks`.
   *
   * ⚠️ **No se puede abrir en el mismo gesto.** La acción confirma con el id,
   * pero la tarea entera llega con el siguiente render del Server Component
   * —`revalidatePath` va por la cola del App Router— y el panel necesita el
   * objeto, no el id: pinta su columna, sus etiquetas y sus encargados.
   *
   * Así que se apunta el id y se abre en cuanto aparece. Si no llegara nunca
   * —la revalidación falló, alguien la borró en medio— esto se queda a `null` y
   * no pasa nada más: no hay panel a medio abrir esperando datos que no vienen.
   */
  const [recienCreada, setRecienCreada] = useState<string | null>(null);

  useEffect(() => {
    if (!recienCreada) return;
    const nueva = originales.find((task) => task.id === recienCreada);
    if (!nueva) return;
    setOpenTaskCrudo(nueva);
    setRecienCreada(null);
  }, [originales, recienCreada]);

  useEffect(() => {
    if (openTask) setRenderedTask(openTask);
  }, [openTask]);

  useEffect(() => {
    if (!openTask) return;
    const fresh = originales.find((task) => task.id === openTask.id);
    if (fresh && fresh !== openTask) setOpenTaskCrudo(fresh);
    if (!fresh) setOpenTaskCrudo(null);
  }, [originales, openTask]);

  /**
   * ⚠️ **La tarea que se pinta también se refresca con el panel cerrado.**
   *
   * `renderedTask` sobrevive al cierre a propósito —es lo que deja terminar la
   * animación de salida—, pero el efecto de arriba se apaga en cuanto
   * `openTask` es `null`, así que se quedaba **congelada en el estado que tenía
   * la tarea antes de editarla**. El panel sigue montado con esos datos viejos,
   * y de ellos salen los `defaultValue` y `defaultChecked` de su formulario: al
   * volver a abrirlo, o al remontarlo para otra tarea, los valores que se daban
   * por buenos eran los de antes del último guardado.
   */
  useEffect(() => {
    if (openTask || !renderedTask) return;
    const fresh = originales.find((task) => task.id === renderedTask.id);
    if (fresh && fresh !== renderedTask) setRenderedTask(fresh);
  }, [originales, openTask, renderedTask]);

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
  const [mobileMenuTask, setMobileMenuTask] = useState<{ id: string; columnId: string } | null>(
    null,
  );

  const [moveState, moveAction] = useAccion(moveTaskAction, TASK_INITIAL_STATE);
  const [reorderState, reorderAction] = useAccion(reorderColumnsAction, COLUMN_INITIAL_STATE);
  const [planState, planAction] = useAccion(planTaskAction, SPRINT_INITIAL_STATE);

  const { movimientos, registrar, confirmar, revertir } = useMovimientosOptimistas(todas);
  const reposicion = useReposicionAnimada();
  /** La pista de columnas, para las píldoras de móvil. */
  const pistaMovil = useRef<HTMLDivElement | null>(null);

  const tasksByColumn = repartirPorColumna(todas, movimientos);

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

  /* Lo mismo para los gestos de planificar (backlog ↔ sprint): otra acción,
     otra cola, el mismo criterio. */
  const colaDePlan = useRef<string[]>([]);
  const ultimoPlan = useRef(planState);
  useEffect(() => {
    if (planState === ultimoPlan.current) return;
    ultimoPlan.current = planState;
    const taskId = colaDePlan.current.shift();
    if (!taskId) return;
    if (planState.error) revertir(taskId);
    else confirmar(taskId);
  }, [planState, revertir, confirmar]);

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
      const task = todas.find((candidata) => candidata.id === taskId);
      const destinoEsBacklog = destino.columnId === BACKLOG;
      const columnaDestino = destinoEsBacklog
        ? undefined
        : columns.find((column) => column.id === destino.columnId);
      if (!task || (!columnaDestino && !destinoEsBacklog)) return;
      const tocaElBacklog = destinoEsBacklog || task.columnId === BACKLOG;
      if (tocaElBacklog && !planificacion?.canPlan) return;

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

      if (tocaElBacklog && planificacion) {
        planificar(task, destino, finales);
        return;
      }
      if (!columnaDestino) return;

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
    [todas, columns, tasksByColumn, projectId, moveAction, registrar, reposicion, planificacion],
  );

  /**
   * Guarda un gesto que entra o sale del backlog: planificar.
   *
   * La tarea cambia de sitio en pantalla al soltar, como cualquier otra, y el
   * servidor recibe una sola acción que cambia el sprint, la columna y el
   * orden. Volver al backlog la lleva a la primera columna: el backlog es
   * trabajo por empezar.
   */
  function planificar(task: Task, destino: { columnId: string; indice: number }, finales: Task[]) {
    if (!planificacion) return;
    const primera = columns[0];
    if (!primera) return;
    const alBacklog = destino.columnId === BACKLOG;
    const columna = alBacklog ? primera : columns.find((c) => c.id === destino.columnId);
    if (!columna) return;
    const desdeElBacklog = task.columnId === BACKLOG;

    registrar({
      taskId: task.id,
      columnId: destino.columnId,
      status: columna.name,
      indice: destino.indice,
    });

    /* La columna de verdad de cada vecina: en el backlog, la que ya tenían. */
    const columnaReal = (id: string) =>
      alBacklog ? (originales.find((t) => t.id === id)?.columnId ?? primera.id) : columna.id;
    const renumerar = finales
      .map((candidata, indice) => ({ candidata, indice }))
      .filter(({ candidata, indice }) => candidata.id !== task.id && candidata.order !== indice)
      .map(({ candidata, indice }) => `${candidata.id}:${indice}:${columnaReal(candidata.id)}`)
      .join(',');

    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('taskId', task.id);
    datos.set('destino', alBacklog ? 'backlog' : columna.id);
    datos.set('status', columna.name);
    datos.set('primeraColumna', primera.id);
    datos.set('order', String(finales.findIndex((t) => t.id === task.id)));
    datos.set('cambiaSprint', String(desdeElBacklog !== alBacklog));
    datos.set('sprintId', planificacion.sprintDestino?.id ?? '');
    datos.set('nombreNuevo', planificacion.nombreNuevo);
    datos.set('renumerar', renumerar);

    colaDePlan.current.push(task.id);
    planAction(datos);
  }

  /** Pasar al sprint o devolver al backlog sin arrastrar: panel de tarea y teclado. */
  const moverSinArrastrar = useCallback(
    (taskId: string, columnId: string) => {
      const indice = (tasksByColumn.get(columnId) ?? []).length;
      guardarMovimiento(taskId, { columnId, indice }, null);
    },
    [tasksByColumn, guardarMovimiento],
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
    registrarCapa,
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
    arrastre?.tipo === 'tarea' ? todas.find((task) => task.id === arrastre.id) : undefined;
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
        /* `group`: lo que activa el botón de «Añadir tarea» al fondo de la
           columna (`ColumnTasks`), que ahora solo se enseña al pasar por
           aquí, no siempre. */
        data-columna-movil={column.id}
        /* Móvil: una columna por pantalla, con imán al deslizar y un borde de
           la siguiente asomando —para que se vea que hay más— (M3 de
           `docs/PLAN-MOVIL.md`). Desde `md`, los 288 px de siempre. */
        className="group flex h-fit max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-[#202020] max-md:w-[calc(100vw-3rem)] max-md:snap-center"
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
            /* En un teléfono las columnas no se reordenan arrastrando (D12): el
               dedo sobre la cabecera es para deslizar entre columnas. */
            if (evento.pointerType !== 'mouse' && window.matchMedia(CONSULTA_MOVIL).matches) return;
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
            {/* El color de la columna ya no es un punto: es el fondo tenue de
                la propia píldora del nombre, como en Jira. Tenue y no sólido
                a propósito — sólido competiría con las tarjetas de dentro,
                que son las que de verdad hay que leer. */}
            <h5
              className="truncate rounded-full px-2.5 py-0.5 font-sans text-sm font-semibold transition-colors"
              style={{
                background: alpha(tintOf(column.color, index), 16),
                color: tintOf(column.color, index),
              }}
            >
              {column.name}
            </h5>
          </span>

          <span className="flex shrink-0 items-center gap-1">
            {/* Reordenar sin arrastrar: el arrastre no llega al teclado ni
                a un lector de pantalla, así que no puede ser la única
                forma de mover una columna. */}
            {canEditColumn && columns.length > 1 && (
              <span className="flex items-center gap-1 max-md:hidden">
                {/* En móvil no se reordenan columnas (D12 de docs/PLAN-MOVIL.md). */}
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
              </span>
            )}
            {/* Con límite WIP, «3/5»; pasado, en tono de aviso. Es blando (D13
                de docs/PLAN-SCRUM-KANBAN.md): se dice, no se impide. */}
            <span
              className="rounded-full px-2 py-0.5 font-sans text-[11px] tabular-nums text-white"
              style={{
                background:
                  column.wipLimit && deLaColumna.length > column.wipLimit
                    ? alpha(colors.warning, 25)
                    : alpha(colors.border, 60),
                color:
                  column.wipLimit && deLaColumna.length > column.wipLimit
                    ? colors.warning
                    : undefined,
              }}
              title={
                column.wipLimit
                  ? deLaColumna.length > column.wipLimit
                    ? `Pasa del límite de ${column.wipLimit} en curso`
                    : `Límite de ${column.wipLimit} en curso`
                  : undefined
              }
            >
              {column.wipLimit ? `${deLaColumna.length}/${column.wipLimit}` : deLaColumna.length}
            </span>
            <ColumnMenu
              boardId={board.id}
              projectId={projectId}
              columnId={column.id}
              columnName={column.name}
              columnColor={column.color}
              taskCount={deLaColumna.length}
              wipLimit={column.wipLimit ?? null}
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
            /**
             * ⚠️ **`openTask?.id`, no el `openTaskId` de las props.** Ese es
             * el de la URL al cargar la página —solo sirve para el estado
             * inicial (arriba)— y no cambia cuando se abre otra tarea con un
             * clic. Con él aquí, el reborde de «tarea abierta» se quedaba
             * fijo en lo que hubiera en la URL, o no aparecía nunca si se
             * entró sin `?task=`.
             */
            openTaskId={openTask?.id ?? null}
            ultimoGuardado={ultimoGuardado}
            onTaskCreated={setRecienCreada}
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

  const aviso = moveState.error ?? reorderState.error ?? planState.error;

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
      <PildorasDeColumnas
        pista={pistaMovil}
        columnas={columnasVisibles.map((column, index) => ({
          id: column.id,
          nombre: column.name,
          tono: tintOf(column.color, index),
          cuantas: (tasksByColumn.get(column.id) ?? []).length,
        }))}
      />
      <div
        ref={(el) => {
          registrarPista(el);
          pistaMovil.current = el;
        }}
        onScroll={reposicion.invalidar}
        className="scrollbar-slim -mx-1 flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto px-1 pb-1 max-md:snap-x max-md:snap-mandatory max-md:gap-3"
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
          style={{ ...BOARD_SURFACE, backgroundColor: '#080807' }}
        >
          <header className="flex flex-wrap items-center gap-3">
            <h4
              className="rounded-full px-2.5 py-1 font-sans text-lg font-semibold"
              style={{
                background: alpha(
                  tintOf(columnaExpandida.color, columns.indexOf(columnaExpandida)),
                  16,
                ),
                color: tintOf(columnaExpandida.color, columns.indexOf(columnaExpandida)),
              }}
            >
              {columnaExpandida.name}
            </h4>
            <span className="font-sans text-xs text-white">
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
              className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs text-white transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MinimizarIcono />
              Salir
            </button>
          </header>

          {/* La columna, con la misma superficie y el mismo redondeo que en la
              tira. Es lo que devuelve el contraste a las tarjetas y lo que hace
              que se reconozca como la columna de siempre. */}
          <div
            className="flex min-h-0 flex-1 flex-col rounded-2xl bg-[#191919] p-2"
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
              ultimoGuardado={ultimoGuardado}
              onTaskCreated={setRecienCreada}
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
          columns={[
            ...(planificacion?.canPlan ? [{ id: BACKLOG, name: 'Backlog' }] : []),
            ...columns.map((c) => ({ id: c.id, name: c.name })),
          ]}
          currentColumnId={mobileMenuTask.columnId}
          onMoveToColumn={(destColId) => {
            moverSinArrastrar(mobileMenuTask.id, destColId);
          }}
        />
      )}

      {renderedTask && (
        <TaskDialog
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
          onSaved={handleTaskSaved}
          planificacion={
            planificacion?.canPlan && columns[0]
              ? (() => {
                  const enBacklog = (tasksByColumn.get(BACKLOG) ?? []).some(
                    (t) => t.id === renderedTask.id,
                  );
                  return {
                    enBacklog,
                    sprint: planificacion.sprintDestino?.name ?? planificacion.nombreNuevo,
                    onMover: () =>
                      moverSinArrastrar(renderedTask.id, enBacklog ? columns[0].id : BACKLOG),
                  };
                })()
              : undefined
          }
        />
      )}

      {planificacion && (
        <BacklogPanel
          abierto={planificacion.panelAbierto}
          onCerrar={planificacion.onCerrarPanel}
          board={board}
          projectId={projectId}
          tareas={tasksByColumn.get(BACKLOG) ?? []}
          members={members}
          labels={labels}
          usersById={usersById}
          currentUserId={currentUserId}
          canCreate={canCreateTask}
          canMove={planificacion.canPlan}
          canComment={canComment}
          canManageLabels={canManageLabels}
          canEdit={canEditTask}
          canDelete={canDeleteTask}
          onOpenTask={setOpenTask}
          openTaskId={openTask?.id ?? null}
          ultimoGuardado={ultimoGuardado}
          arrastre={arrastre}
          destino={destinoTarea}
          alEmpezarArrastre={empezarArrastreDeTarea}
          registrarColumna={registrarColumna}
          registrarCapa={registrarCapa}
          registrarLista={registrarLista}
          registrarTarjeta={registrarTarjeta}
          registrarReposicion={reposicion.registrar}
          alDesplazar={reposicion.invalidar}
        />
      )}
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
      className="flex flex-col gap-3 rounded-2xl bg-[#191919] px-4 py-4"
      style={{ boxShadow: `0 24px 48px -12px ${alpha(colors.overlay, 70)}` }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <h5
          className="truncate rounded-full px-2.5 py-0.5 font-sans text-sm font-semibold"
          style={{ background: alpha(tono, 16), color: tono }}
        >
          {nombre}
        </h5>
        <span
          className="ml-auto rounded-full px-2 py-0.5 font-sans text-[11px] tabular-nums text-white"
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
      className="rounded p-0.5 text-white transition-colors hover:text-white disabled:opacity-25 disabled:hover:text-white"
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

/**
 * Las columnas como píldoras, arriba del tablero, **solo en móvil** (M3 de
 * `docs/PLAN-MOVIL.md`).
 *
 * Con una columna por pantalla no se ve cuántas hay ni en cuál estás: esta
 * fila lo dice —nombre y número de tareas— y marca la que se está mirando
 * según se desliza. Tocar una lleva a ella.
 */
function PildorasDeColumnas({
  pista,
  columnas,
}: {
  pista: React.RefObject<HTMLDivElement | null>;
  columnas: { id: string; nombre: string; tono: string; cuantas: number }[];
}) {
  const [actual, setActual] = useState(0);
  const fila = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const alDesplazar = () => {
      const hijos = [...el.querySelectorAll<HTMLElement>('[data-columna-movil]')];
      const centro = el.scrollLeft + el.clientWidth / 2;
      let mejor = 0;
      let distancia = Number.POSITIVE_INFINITY;
      hijos.forEach((hijo, i) => {
        const d = Math.abs(hijo.offsetLeft + hijo.offsetWidth / 2 - centro);
        if (d < distancia) {
          distancia = d;
          mejor = i;
        }
      });
      setActual(mejor);
    };
    el.addEventListener('scroll', alDesplazar, { passive: true });
    return () => el.removeEventListener('scroll', alDesplazar);
  }, [pista]);

  /* La píldora marcada, siempre a la vista en su propia fila. */
  useEffect(() => {
    const boton = fila.current?.children[actual] as HTMLElement | undefined;
    boton?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [actual]);

  if (columnas.length < 2) return null;

  return (
    <div
      ref={fila}
      role="tablist"
      aria-label="Columnas"
      className="scrollbar-none -mx-1 mb-2 flex shrink-0 gap-1.5 overflow-x-auto px-1 md:hidden"
    >
      {columnas.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={i === actual}
          onClick={() => {
            const destino = pista.current?.querySelector<HTMLElement>(
              `[data-columna-movil="${c.id}"]`,
            );
            destino?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }}
          className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 font-sans text-[13px] font-medium transition-colors ${
            i === actual ? 'bg-white/10 text-white' : 'text-text-secondary'
          }`}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: c.tono }}
          />
          {c.nombre}
          <span className="tabular-nums text-text-secondary">{c.cuantas}</span>
        </button>
      ))}
    </div>
  );
}
