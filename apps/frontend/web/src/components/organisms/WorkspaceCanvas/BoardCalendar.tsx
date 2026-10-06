'use client';

import { createTaskAction, moveTaskDueDateAction } from '@/app/(privado)/projects/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  Avatar,
  type Board,
  DONE_COLUMN_COLOR,
  type Label as LabelType,
  type Priority,
  type Task,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  dueState,
  personLabel,
  useAccion,
  useEsMovil,
} from '@praxis/commons';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TaskDialog } from '../TaskBoard/TaskDialog';
import { useTaskDialog } from '../TaskBoard/useTaskDialog';

export interface BoardCalendarProps {
  board: Board;
  projectId: string;
  tasks: Task[];
  members: UserProfile[];
  labels: LabelType[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  openTaskId?: string | null;
  canMoveTask: boolean;
  /** El «+» de cada día: `canCreateTask`. */
  canCreateTask: boolean;
  canComment: boolean;
  canManageLabels: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** `YYYY-MM-DD` en horario local, para agrupar tareas por día sin líos de zona. */
function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** La inversa de `claveDia`, en horario local (no `new Date('YYYY-MM-DD')`, que es UTC). */
function deClave(clave: string): Date {
  const [y, m, d] = clave.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Sumar días con `setDate` y no con milisegundos: un día de cambio de horario
 * mide 23 o 25 horas, y sumar `DIA_MS` dejaría la fecha a las 23:00 del día
 * anterior.
 */
function sumarDias(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

/** El lunes de la semana de `d`, a medianoche local. */
function inicioDeSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

/** Cuántas semanas se añaden de golpe al acercarse a un borde. */
const SEMANAS_POR_TANDA = 8;
/** A cuántos píxeles del borde se añade la siguiente tanda. */
const MARGEN_DE_CARGA_PX = 600;

function tonoDePrioridad(p: Priority): string {
  return p === 'URGENT'
    ? colors.error
    : p === 'HIGH'
      ? colors.warning
      : p === 'MEDIUM'
        ? colors.info
        : colors.textSecondary;
}

/**
 * La vista de **calendario** del tablero: semanas en filas de siete días, con
 * scroll infinito, y las tareas puestas en su fecha de vencimiento. El «+» de
 * cada día crea una tarea con esa fecha ya puesta. Las tareas **sin fecha** viven en su
 * propio panel al lado, para que no desaparezcan. Pulsar una abre el panel de
 * siempre.
 *
 * Se arrastra una tarea a otro día para cambiar su vencimiento (o a «sin
 * fecha» para quitárselo), con el mismo permiso que mueve tarjetas en Kanban
 * (`canMoveTask`). Sin él, la tarea se sigue pudiendo abrir, solo que no
 * arrastrar.
 */
export function BoardCalendar({
  board,
  projectId,
  tasks,
  members,
  labels,
  usersById,
  currentUserId,
  openTaskId,
  canMoveTask,
  canCreateTask,
  canComment,
  canManageLabels,
  canEditTask,
  canDeleteTask,
}: BoardCalendarProps) {
  const nombreDeColumna = useMemo(
    () => new Map(board.columns.map((c) => [c.id, c.name])),
    [board.columns],
  );
  const dialog = useTaskDialog(tasks, openTaskId);
  const [mostrarSinFecha, setMostrarSinFecha] = useState(false);

  /**
   * Arrastrar una tarea a otro día cambia su vencimiento, y se guarda solo.
   *
   * Es arrastre nativo (`draggable`), no el motor a medida del Kanban
   * (`arrastre.ts`): aquí el destino es un día entero, no «entre qué dos
   * tarjetas», que es justo la precisión que ese motor existe para dar. Sin
   * esa necesidad, la API nativa del navegador basta y no hay que reconstruir
   * la medición de rectángulos para esto.
   */
  const [moveState, moveAction] = useAccion(moveTaskDueDateAction, TASK_INITIAL_STATE);
  const [diaSobrevolado, setDiaSobrevolado] = useState<string | null>(null);
  /** Adelanta el resultado en pantalla mientras el servidor confirma. `null` es «sin fecha». */
  const [overrides, setOverrides] = useState<Map<string, string | null>>(new Map());
  const colaDeMovimientos = useRef<string[]>([]);
  const ultimoResultado = useRef(moveState);

  useEffect(() => {
    if (moveState === ultimoResultado.current) return;
    ultimoResultado.current = moveState;
    const taskId = colaDeMovimientos.current.shift();
    if (!taskId || !moveState.error) return;
    /* Falló: se deshace el adelanto y la tarea vuelve a su día de verdad. */
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
  }, [moveState]);

  /* Cuando el servidor confirma —la tarea revalidada ya trae el día nuevo—
     el adelanto sobra: dejarlo puesto no cambiaría nada, pero mantenerlo
     indefinidamente arrastraría estado viejo si la tarea vuelve a moverse
     por otro medio (el panel, por ejemplo). */
  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      let cambio = false;
      const next = new Map(prev);
      for (const [taskId, dueDate] of prev) {
        const task = tasks.find((t) => t.id === taskId);
        const diaReal = task?.dueDate ? claveDia(new Date(task.dueDate)) : null;
        if (task && diaReal === dueDate) {
          next.delete(taskId);
          cambio = true;
        }
      }
      return cambio ? next : prev;
    });
  }, [tasks]);

  /** Columnas de cierre: lo que hay dentro está entregado. Ver `DONE_COLUMN_COLOR`. */
  const columnasDeCierre = useMemo(
    () => new Set(board.columns.filter((c) => c.color === DONE_COLUMN_COLOR).map((c) => c.id)),
    [board.columns],
  );
  const estaCompletada = useCallback(
    (t: Task) => columnasDeCierre.has(t.columnId),
    [columnasDeCierre],
  );

  /**
   * El día de una tarea, ya como clave `YYYY-MM-DD`.
   *
   * ⚠️ **El adelanto se guarda como clave de día, no como ISO, y aquí no se
   * vuelve a pasar por `new Date(...)`.** `new Date('2026-09-19')` (sin hora)
   * se interpreta en UTC; en un huso al oeste de Greenwich, `getFullYear`/
   * `getDate` en horario **local** devuelven el día anterior. Solo se
   * reconstruye la fecha para lo que sí trae hora de verdad (`dueDate`,
   * `completedAt`), que vienen en ISO completo del backend.
   */
  const diaDeTarea = useCallback(
    (t: Task): string | null => {
      if (overrides.has(t.id)) return overrides.get(t.id) ?? null;
      if (t.dueDate) return claveDia(new Date(t.dueDate));
      if (estaCompletada(t)) {
        // Una tarea cerrada antes del 2026-07-30 no tiene `completedAt`
        // (el campo no existía) — se cae a `updatedAt` solo en ese caso.
        return claveDia(new Date(t.completedAt ?? t.updatedAt));
      }
      return null;
    },
    [overrides, estaCompletada],
  );

  /** `dia` es una clave `YYYY-MM-DD`, o `null` para soltar en «sin fecha». */
  function soltarEn(taskId: string, dia: string | null) {
    setDiaSobrevolado(null);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (diaDeTarea(task) === dia) return;

    setOverrides((prev) => new Map(prev).set(taskId, dia));

    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('taskId', taskId);
    datos.set('dueDate', dia ?? '');
    colaDeMovimientos.current.push(taskId);
    moveAction(datos);
  }

  /**
   * Una tarea completada sin fecha de vencimiento no va a «sin fecha»: se
   * ubica el día en que se completó, para que no desaparezca del trabajo
   * hecho esa semana. Si sale de una columna de cierre sin tener vencimiento,
   * vuelve a «sin fecha» — la regla de arriba deja de aplicar.
   *
   * Usa `Task.completedAt`, que tasks-service escribe al entrar a una columna
   * de cierre y limpia si sale de ahí (`docs/frontend/PENDIENTES-BACKEND.md
   * §27`, resuelto 2026-09-22). Solo cae a `updatedAt` para tareas cerradas
   * antes de que el campo existiera (2026-07-30).
   */
  const { conFecha, sinFecha } = useMemo(() => {
    const map = new Map<string, Task[]>();
    const nada: Task[] = [];
    for (const t of tasks) {
      const k = diaDeTarea(t);
      if (!k) {
        nada.push(t);
        continue;
      }
      let list = map.get(k);
      if (!list) {
        list = [];
        map.set(k, list);
      }
      list.push(t);
    }
    return { conFecha: map, sinFecha: nada };
  }, [tasks, diaDeTarea]);

  const hoy = useMemo(() => new Date(), []);
  const claveHoy = claveDia(hoy);

  /**
   * ## Scroll infinito por semanas, como Notion
   *
   * Era una cuadrícula de **un** mes (6 × 7 celdas encajadas en la altura que
   * quedara), con flechas para pasar de mes. Con cuatro tareas en un día, la
   * celda las escondía tras su propio scroll, y ver lo que cruza de un mes al
   * siguiente obligaba a ir y volver.
   *
   * Ahora es una lista de semanas que se desplaza en vertical sin fin: cada fila
   * mide lo que necesitan sus tareas, y al acercarse a un borde se añaden
   * `SEMANAS_POR_TANDA` más. La cabecera dice **el mes que se está mirando**, y
   * cambia sola al desplazar; las flechas y «Hoy» llevan a un mes concreto.
   *
   * ⚠️ **Añadir semanas ARRIBA empuja todo hacia abajo.** Sin compensar, el
   * contenido saltaría una tanda entera bajo el puntero. Se guarda el
   * `scrollHeight` antes y se suma la diferencia a `scrollTop` después, en un
   * `useLayoutEffect` para que el salto no llegue a pintarse.
   */
  const [rango, setRango] = useState(() => ({
    desde: sumarDias(inicioDeSemana(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), -7 * 8),
    semanas: 8 + 6 + SEMANAS_POR_TANDA,
  }));
  const semanas = useMemo(
    () => Array.from({ length: rango.semanas }, (_, i) => sumarDias(rango.desde, i * 7)),
    [rango],
  );
  const [mesVisible, setMesVisible] = useState(
    () => new Date(hoy.getFullYear(), hoy.getMonth(), 1),
  );

  const cuerpo = useRef<HTMLDivElement>(null);
  /** El `scrollHeight` de antes de añadir semanas arriba, para compensar. */
  const alturaAntesDePrepender = useRef<number | null>(null);
  /**
   * A qué semana desplazarse cuando esté pintada.
   *
   * ⚠️ **Salto seco, no `behavior: 'smooth'`.** Un desplazamiento animado
   * dispara `onScroll` durante el trayecto; si pasa cerca del borde de arriba,
   * se añaden semanas y la compensación de `scrollTop` choca con la animación,
   * que acaba en otro mes.
   */
  const [destino, setDestino] = useState<string | null>(() =>
    claveDia(inicioDeSemana(new Date(hoy.getFullYear(), hoy.getMonth(), 1))),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rango` no se lee dentro, pero es lo que cambia la altura del cuerpo: este efecto tiene que correr justo después de cada tanda nueva de semanas
  useLayoutEffect(() => {
    const el = cuerpo.current;
    if (!el) return;
    if (destino) {
      const fila = el.querySelector<HTMLElement>(`[data-semana="${destino}"]`);
      if (fila) {
        alturaAntesDePrepender.current = null;
        el.scrollTop = fila.offsetTop;
        setDestino(null);
      }
      return;
    }
    if (alturaAntesDePrepender.current !== null) {
      el.scrollTop += el.scrollHeight - alturaAntesDePrepender.current;
      alturaAntesDePrepender.current = null;
    }
  }, [destino, rango]);

  const alDesplazar = useCallback(() => {
    const el = cuerpo.current;
    if (!el) return;

    /* El mes que se mira: el del jueves de la fila que cruza el primer tercio
       de la vista. El jueves decide a qué mes pertenece una semana partida (ISO
       8601); el tercio, que la cabecera no diga el mes que ya se está yendo
       por arriba cuando el siguiente llena la pantalla. */
    const linea = el.scrollTop + el.clientHeight / 3;
    const filas = el.querySelectorAll<HTMLElement>('[data-semana]');
    for (const fila of filas) {
      if (fila.offsetTop + fila.offsetHeight > linea) {
        const jueves = sumarDias(deClave(fila.dataset.semana ?? ''), 3);
        setMesVisible((actual) =>
          actual.getFullYear() === jueves.getFullYear() && actual.getMonth() === jueves.getMonth()
            ? actual
            : new Date(jueves.getFullYear(), jueves.getMonth(), 1),
        );
        break;
      }
    }

    if (alturaAntesDePrepender.current !== null || destino) return;
    if (el.scrollTop < MARGEN_DE_CARGA_PX) {
      alturaAntesDePrepender.current = el.scrollHeight;
      setRango((r) => ({
        desde: sumarDias(r.desde, -7 * SEMANAS_POR_TANDA),
        semanas: r.semanas + SEMANAS_POR_TANDA,
      }));
    } else if (el.scrollHeight - el.scrollTop - el.clientHeight < MARGEN_DE_CARGA_PX) {
      setRango((r) => ({ ...r, semanas: r.semanas + SEMANAS_POR_TANDA }));
    }
  }, [destino]);

  /** Llevar la vista a un mes, ampliando el rango si aún no está pintado. */
  function irAMes(mes: Date) {
    const lunes = inicioDeSemana(new Date(mes.getFullYear(), mes.getMonth(), 1));
    const clave = claveDia(lunes);
    setRango((r) => {
      const fin = sumarDias(r.desde, r.semanas * 7);
      if (lunes < r.desde) {
        const extra = Math.ceil((r.desde.getTime() - lunes.getTime()) / (7 * DIA_MS)) + 4;
        return { desde: sumarDias(r.desde, -7 * extra), semanas: r.semanas + extra };
      }
      if (sumarDias(lunes, 7 * 6) > fin) {
        const extra = Math.ceil((sumarDias(lunes, 7 * 6).getTime() - fin.getTime()) / (7 * DIA_MS));
        return { ...r, semanas: r.semanas + extra + 4 };
      }
      return r;
    });
    setDestino(clave);
    setMesVisible(new Date(mes.getFullYear(), mes.getMonth(), 1));
  }

  /**
   * El alta desde un día: el «+» de la celda abre un campo y la tarea nace con
   * esa fecha límite, en la **primera columna** del tablero —la misma que el
   * «Añadir tarea» del Kanban usaría para empezar—. Al crearla se abre su
   * panel, igual que allí, en cuanto la revalidación la trae.
   */
  const primeraColumna = useMemo(
    () => [...board.columns].sort((a, b) => a.order - b.order)[0],
    [board.columns],
  );
  const puedeCrear = canCreateTask && !!primeraColumna;
  const [creandoEn, setCreandoEn] = useState<string | null>(null);
  const [recienCreada, setRecienCreada] = useState<string | null>(null);
  const abrirTarea = dialog.open;
  useEffect(() => {
    if (!recienCreada) return;
    if (!tasks.some((t) => t.id === recienCreada)) return;
    abrirTarea(recienCreada);
    setRecienCreada(null);
  }, [tasks, recienCreada, abrirTarea]);

  const mesVisibleIdx = mesVisible.getFullYear() * 12 + mesVisible.getMonth();
  /* Móvil: agenda en vez de cuadrícula (M3 de `docs/PLAN-MOVIL.md`). Por
     `useEsMovil` y no por CSS: pintar las dos duplicaría cada tarea en el DOM. */
  const esMovil = useEsMovil();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      {/* ── Calendario ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#202020]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <h4
              aria-live="polite"
              className="min-w-[10rem] font-sans text-lg font-semibold text-white"
            >
              {MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
            </h4>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() =>
                  irAMes(new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1, 1))
                }
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-white transition-colors hover:bg-white/5"
              >
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                onClick={() => irAMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1))}
                className="cursor-pointer rounded-md px-2.5 py-1 font-sans text-xs font-medium text-white transition-colors hover:bg-white/5"
              >
                Hoy
              </button>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() =>
                  irAMes(new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 1))
                }
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-white transition-colors hover:bg-white/5"
              >
                <Chevron dir="right" />
              </button>
            </div>
          </div>
          {sinFecha.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarSinFecha((v) => !v)}
              aria-expanded={mostrarSinFecha}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-white/5"
            >
              <span>Sin fecha ({sinFecha.length})</span>
              <span className={`transition-transform ${mostrarSinFecha ? 'rotate-180' : ''}`}>
                <Chevron dir="right" />
              </span>
            </button>
          )}
        </div>

        {!esMovil && (
          <div className="grid shrink-0 grid-cols-7 border-b border-white/10">
            {DIAS.map((d) => (
              <div
                key={d}
                className="px-2 py-1.5 text-right font-sans text-[11px] font-medium text-white/40"
              >
                {d}
              </div>
            ))}
          </div>
        )}

        <div
          ref={cuerpo}
          onScroll={alDesplazar}
          className="scrollbar-slim relative min-h-0 flex-1 overflow-y-auto"
        >
          {esMovil
            ? semanas.map((lunes) => (
                <AgendaSemana
                  key={claveDia(lunes)}
                  lunes={lunes}
                  conFecha={conFecha}
                  claveHoy={claveHoy}
                  puedeCrear={puedeCrear}
                  creandoEn={creandoEn}
                  onCrearEn={setCreandoEn}
                  formulario={(k) =>
                    primeraColumna && (
                      <CrearEnDia
                        projectId={projectId}
                        boardId={board.id}
                        columnId={primeraColumna.id}
                        columnName={primeraColumna.name}
                        dia={k}
                        onClose={() => setCreandoEn((actual) => (actual === k ? null : actual))}
                        onCreated={setRecienCreada}
                      />
                    )
                  }
                  pintarTarea={(t) => (
                    <TareaChip
                      key={t.id}
                      task={t}
                      usersById={usersById}
                      grande
                      completada={estaCompletada(t)}
                      columna={nombreDeColumna.get(t.columnId)}
                      onClick={() => dialog.open(t.id)}
                    />
                  )}
                />
              ))
            : semanas.map((lunes) => {
                const claveSemana = claveDia(lunes);
                return (
                  <div key={claveSemana} data-semana={claveSemana} className="grid grid-cols-7">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = sumarDias(lunes, i);
                      const k = claveDia(d);
                      const esHoy = k === claveHoy;
                      const delMesVisible = d.getFullYear() * 12 + d.getMonth() === mesVisibleIdx;
                      const delDia = conFecha.get(k) ?? [];
                      const finDeSemana = i >= 5;
                      return (
                        <div
                          key={k}
                          onDragOver={(e) => {
                            if (!canMoveTask) return;
                            e.preventDefault();
                            if (diaSobrevolado !== k) setDiaSobrevolado(k);
                          }}
                          onDragLeave={() =>
                            setDiaSobrevolado((actual) => (actual === k ? null : actual))
                          }
                          onDrop={(e) => {
                            if (!canMoveTask) return;
                            e.preventDefault();
                            soltarEn(e.dataTransfer.getData('text/plain'), k);
                          }}
                          className={`group/dia flex min-h-[8.5rem] min-w-0 flex-col gap-1 border-b border-r border-white/[0.06] p-1.5 transition-colors ${
                            finDeSemana ? 'bg-black/[0.12]' : ''
                          } ${diaSobrevolado === k ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : ''}`}
                        >
                          <div className="flex h-6 shrink-0 items-center justify-between gap-1">
                            {puedeCrear ? (
                              <button
                                type="button"
                                onClick={() => setCreandoEn(k)}
                                aria-label={`Nueva tarea el ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`}
                                title="Nueva tarea en este día"
                                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-white/60 opacity-0 transition-opacity hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary group-hover/dia:opacity-100"
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
                                    d="M12 5v14m7-7H5"
                                  />
                                </svg>
                              </button>
                            ) : (
                              <span />
                            )}
                            <span
                              className={`rounded-full px-1.5 py-0.5 font-sans text-xs tabular-nums ${
                                esHoy
                                  ? 'bg-primary font-semibold text-primary-foreground'
                                  : delMesVisible
                                    ? 'text-white/75'
                                    : 'text-white/30'
                              }`}
                            >
                              {/* El día 1 lleva el mes: es la única pista de dónde
                              empieza uno nuevo en una lista que no se corta. */}
                              {d.getDate() === 1
                                ? `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3).toLowerCase()}`
                                : d.getDate()}
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-col gap-1">
                            {delDia.map((t) => (
                              <TareaChip
                                key={t.id}
                                task={t}
                                usersById={usersById}
                                arrastrable={canMoveTask}
                                completada={estaCompletada(t)}
                                onClick={() => dialog.open(t.id)}
                              />
                            ))}
                            {creandoEn === k && primeraColumna && (
                              <CrearEnDia
                                projectId={projectId}
                                boardId={board.id}
                                columnId={primeraColumna.id}
                                columnName={primeraColumna.name}
                                dia={k}
                                onClose={() =>
                                  setCreandoEn((actual) => (actual === k ? null : actual))
                                }
                                onCreated={setRecienCreada}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
        </div>
      </div>

      {/* ── Sin fecha ── */}
      {sinFecha.length > 0 && (
        <div
          onDragOver={(e) => {
            if (!canMoveTask) return;
            e.preventDefault();
            if (diaSobrevolado !== 'sin-fecha') setDiaSobrevolado('sin-fecha');
          }}
          onDragLeave={() =>
            setDiaSobrevolado((actual) => (actual === 'sin-fecha' ? null : actual))
          }
          onDrop={(e) => {
            if (!canMoveTask) return;
            e.preventDefault();
            soltarEn(e.dataTransfer.getData('text/plain'), null);
          }}
          className={`flex shrink-0 flex-col overflow-hidden rounded-xl bg-[#202020] border-white/10 transition-all duration-300 ease-in-out ${
            mostrarSinFecha ? 'w-full lg:w-64 opacity-100 border' : 'w-0 opacity-0 border-0'
          } ${diaSobrevolado === 'sin-fecha' ? 'bg-primary/10' : ''}`}
        >
          <div className="shrink-0 border-b border-white/10 px-3 py-2.5 flex items-center justify-between">
            <h4 className="font-sans text-sm font-semibold text-white whitespace-nowrap">
              Sin fecha <span className="font-normal text-white">{sinFecha.length}</span>
            </h4>
            <button
              type="button"
              onClick={() => setMostrarSinFecha(false)}
              className="text-text-secondary hover:text-white/70"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {sinFecha.map((t) => (
              <TareaChip
                key={t.id}
                task={t}
                usersById={usersById}
                arrastrable={canMoveTask}
                grande
                columna={nombreDeColumna.get(t.columnId)}
                onClick={() => dialog.open(t.id)}
              />
            ))}
          </div>
        </div>
      )}

      {dialog.renderedTask && (
        <TaskDialog
          open={dialog.isOpen}
          onClose={dialog.close}
          projectId={projectId}
          boardId={board.id}
          task={dialog.renderedTask}
          columnId={dialog.renderedTask.columnId}
          columnName={nombreDeColumna.get(dialog.renderedTask.columnId) ?? ''}
          members={members}
          labels={labels}
          usersById={usersById}
          currentUserId={currentUserId}
          canToggleChecklist={canMoveTask}
          canComment={canComment}
          canManageLabels={canManageLabels}
          canEdit={canEditTask}
          canDelete={canDeleteTask}
        />
      )}
    </div>
  );
}

const diaLargo = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/**
 * Una semana del calendario **en móvil**, como agenda: solo los días que tienen
 * algo —y hoy, siempre—, con su cabecera fija mientras se desplaza y un «+»
 * para crear con la fecha puesta. Siete columnas en 390 px dejaban celdas de
 * 50 px con títulos de cinco letras; una lista se lee.
 *
 * Conserva `data-semana`: el scroll infinito y el mes de la cabecera salen de
 * esas filas, igual que en la cuadrícula.
 */
function AgendaSemana({
  lunes,
  conFecha,
  claveHoy,
  puedeCrear,
  creandoEn,
  onCrearEn,
  formulario,
  pintarTarea,
}: {
  lunes: Date;
  conFecha: Map<string, Task[]>;
  claveHoy: string;
  puedeCrear: boolean;
  creandoEn: string | null;
  onCrearEn: (dia: string) => void;
  formulario: (dia: string) => React.ReactNode;
  pintarTarea: (t: Task) => React.ReactNode;
}) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  return (
    <div data-semana={claveDia(lunes)}>
      {dias.map((d) => {
        const k = claveDia(d);
        const delDia = conFecha.get(k) ?? [];
        const esHoy = k === claveHoy;
        const empiezaMes = d.getDate() === 1;
        if (!esHoy && !empiezaMes && delDia.length === 0 && creandoEn !== k) return null;
        return (
          <div key={k}>
            {empiezaMes && (
              <h5 className="px-4 pb-1 pt-5 font-sans text-base font-semibold text-white">
                {MESES[d.getMonth()]} {d.getFullYear()}
              </h5>
            )}
            {(esHoy || delDia.length > 0 || creandoEn === k) && (
              <section aria-label={diaLargo.format(d)} className="border-b border-white/[0.06]">
                <header className="sticky top-0 z-10 flex min-h-11 items-center gap-2 bg-[#202020]/95 px-4 backdrop-blur">
                  <span
                    className={`font-sans text-[13px] font-semibold capitalize ${
                      esHoy ? 'text-primary' : 'text-white/80'
                    }`}
                  >
                    {diaLargo.format(d)}
                  </span>
                  {esHoy && (
                    <span className="rounded-full bg-primary px-2 py-0.5 font-sans text-[10px] font-semibold text-primary-foreground">
                      Hoy
                    </span>
                  )}
                  {puedeCrear && (
                    <button
                      type="button"
                      onClick={() => onCrearEn(k)}
                      aria-label={`Nueva tarea el ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`}
                      className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-white/70 active:bg-white/10"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                      </svg>
                    </button>
                  )}
                </header>
                <div className="flex flex-col gap-1.5 px-3 pb-3">
                  {delDia.map(pintarTarea)}
                  {creandoEn === k && formulario(k)}
                  {esHoy && delDia.length === 0 && creandoEn !== k && (
                    <p className="px-1 py-1 font-sans text-xs text-text-secondary">
                      Nada para hoy.
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TareaChip({
  task,
  usersById,
  onClick,
  grande = false,
  columna,
  arrastrable = false,
  completada = false,
}: {
  task: Task;
  usersById: Map<string, UserProfile>;
  onClick: () => void;
  grande?: boolean;
  columna?: string;
  /** En una columna de cierre: se tacha y se apaga, como en el Kanban. */
  completada?: boolean;
  /** Permiso de mover: sin él la tarea se puede abrir, pero no arrastrar. */
  arrastrable?: boolean;
}) {
  const due = dueState(task.dueDate);
  const tono = due === 'overdue' ? colors.error : tonoDePrioridad(task.priority);
  const primerEncargado = task.assignees[0];
  const usuario = primerEncargado ? usersById.get(primerEncargado.userId) : undefined;
  return (
    <button
      type="button"
      draggable={arrastrable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onClick}
      title={task.title}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left transition-opacity hover:opacity-80 ${
        grande ? 'py-1.5' : 'py-1'
      } ${arrastrable ? 'cursor-grab active:cursor-grabbing' : ''} ${completada ? 'opacity-55' : ''}`}
      style={{ background: alpha(tono, grande ? 12 : 16) }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tono }} />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-sans font-medium ${grande ? 'text-[12px] text-white' : 'text-xs text-white/90'} ${completada ? 'line-through' : ''}`}
        >
          {task.title}
        </span>
        {grande && columna && (
          <span className="block truncate font-sans text-[10px] text-white/35">{columna}</span>
        )}
      </span>
      {/* Quién la lleva, de un vistazo: antes solo se sabía abriendo la tarea. */}
      {primerEncargado && (
        <Avatar
          size="sm"
          label={usuario ? personLabel(usuario) : 'Alguien que ya no está en el proyecto'}
          src={avatarHref(usuario?.avatarUrl, '/api/gateway')}
          className="shrink-0"
        />
      )}
      {task.assignees.length > 1 && (
        <span className="shrink-0 font-sans text-[9px] text-white/40">
          +{task.assignees.length - 1}
        </span>
      )}
    </button>
  );
}

/**
 * El alta en línea dentro de un día. Mismo gesto que el «Añadir tarea» del
 * Kanban: Enter crea, Escape o salir con el campo vacío cierra. Envía con
 * `onSubmit` y un `FormData` a mano en vez de `action={…}`: el reseteo
 * automático de React 19 vaciaría el campo *antes* de saber si se guardó.
 */
function CrearEnDia({
  projectId,
  boardId,
  columnId,
  columnName,
  dia,
  onClose,
  onCreated,
}: {
  projectId: string;
  boardId: string;
  columnId: string;
  /** `status` tiene que igualar el nombre de la columna, no su id. */
  columnName: string;
  /** `YYYY-MM-DD`: lo que espera `createTaskAction` en `dueDate`. */
  dia: string;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [state, crear, pending] = useAccion(createTaskAction, TASK_INITIAL_STATE);
  const campo = useRef<HTMLInputElement>(null);
  const ultimo = useRef(state);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  useEffect(() => {
    if (state === ultimo.current) return;
    ultimo.current = state;
    if (!state.done) return;
    /* No hace falta vaciar el campo: `onClose` desmonta el formulario. */
    onCreated(state.done);
    onClose();
  }, [state, onCreated, onClose]);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!titulo.trim() || pending) return;
        const datos = new FormData();
        datos.set('projectId', projectId);
        datos.set('boardId', boardId);
        datos.set('columnId', columnId);
        datos.set('status', columnName);
        datos.set('title', titulo.trim());
        datos.set('dueDate', dia);
        crear(datos);
      }}
      className="flex flex-col gap-1"
    >
      <input
        ref={campo}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onBlur={() => !titulo.trim() && !pending && onClose()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        maxLength={255}
        disabled={pending}
        placeholder={pending ? 'Creando…' : 'Nueva tarea'}
        aria-label="Título de la tarea nueva"
        className="h-7 w-full min-w-0 rounded-md border border-white/10 bg-[#191919] px-2 font-sans text-xs text-white outline-none placeholder:text-white/40 focus:border-primary"
      />
      {state.error && (
        <p role="alert" className="font-sans text-[10px]" style={{ color: colors.error }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
      />
    </svg>
  );
}
