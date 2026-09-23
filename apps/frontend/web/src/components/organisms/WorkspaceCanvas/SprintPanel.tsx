'use client';

import {
  closeSprintAction,
  createSprintAction,
  startSprintAction,
} from '@/app/(privado)/projects/[id]/sprint-actions';
import { CLOSE_SPRINT_INITIAL_STATE, SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  type PendingSprintTask,
  type Sprint,
  type Task,
  useAccion,
} from '@praxis/commons';
import { type ReactNode, useMemo, useState } from 'react';
import { BurndownChart } from './BurndownChart';
import { calcularBurndown, calcularVelocidad, conUnidad } from './burndown';
import {
  diasRestantes,
  fechasPorDefecto,
  rangoDeFechas,
  sprintActivo,
  sprintsCerrados,
  sprintsPlaneados,
  textoDiasRestantes,
} from './scrum';

export interface SprintPanelProps {
  board: Board;
  projectId: string;
  /** Todas las tareas del tablero. */
  tasks: Task[];
  sprints: Sprint[];
  /** Planear, iniciar y cerrar: `canManageSprint`. */
  canManageSprint: boolean;
}

/**
 * La vista **Sprint** de un tablero Scrum: el que está en curso, los que
 * vienen y los que ya pasaron. Ver `docs/PLAN-SCRUM-KANBAN.md`.
 *
 * Filas con raya fina y tipografía como jerarquía (`kyloo-design` §4): el
 * sprint en curso es el titular, lo demás son listas.
 */
export function SprintPanel({
  board,
  projectId,
  tasks,
  sprints,
  canManageSprint,
}: SprintPanelProps) {
  const activo = sprintActivo(sprints);
  const planeados = useMemo(() => sprintsPlaneados(sprints), [sprints]);
  const cerrados = useMemo(() => sprintsCerrados(sprints), [sprints]);
  const velocidad = useMemo(() => calcularVelocidad(cerrados, tasks), [cerrados, tasks]);

  const cuentaPorSprint = useMemo(() => {
    const cuenta = new Map<string, { total: number; hechas: number }>();
    for (const t of tasks) {
      if (!t.sprintId) continue;
      const c = cuenta.get(t.sprintId) ?? { total: 0, hechas: 0 };
      c.total += 1;
      if (t.completedAt) c.hechas += 1;
      cuenta.set(t.sprintId, c);
    }
    return cuenta;
  }, [tasks]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 pb-8">
        {activo ? (
          <SprintEnCurso
            board={board}
            projectId={projectId}
            sprint={activo}
            tasks={tasks}
            planeados={planeados}
            cuenta={cuentaPorSprint.get(activo.id) ?? { total: 0, hechas: 0 }}
            canManageSprint={canManageSprint}
            velocidadMedia={velocidad.media}
          />
        ) : (
          <section className="flex flex-col gap-2 border-b border-border pb-6">
            <h2 className="font-display text-2xl text-text-primary">Ningún sprint en curso</h2>
            <p className="font-sans text-sm text-text-secondary">
              {planeados.length > 0
                ? 'Inicia uno de los planeados de abajo. Mientras tanto, el Kanban de este tablero se queda vacío: no hay nada comprometido.'
                : canManageSprint
                  ? 'Planea el primero aquí abajo, llénalo desde el Backlog e inícialo cuando el equipo esté listo.'
                  : 'Quien gestione los sprints de este tablero puede planear el primero.'}
            </p>
          </section>
        )}

        <section aria-label="Sprints planeados" className="flex flex-col">
          <h3 className="border-b border-border pb-2 font-sans text-sm font-semibold text-text-primary">
            Planeados
          </h3>
          {planeados.length === 0 && (
            <p className="py-3 font-sans text-xs text-text-secondary">Ninguno todavía.</p>
          )}
          <ul className="flex flex-col">
            {planeados.map((sprint) => (
              <SprintPlaneado
                key={sprint.id}
                board={board}
                projectId={projectId}
                sprint={sprint}
                tareas={cuentaPorSprint.get(sprint.id)?.total ?? 0}
                puedeIniciar={canManageSprint && !activo}
              />
            ))}
          </ul>
          {canManageSprint && (
            <NuevoSprint
              board={board}
              projectId={projectId}
              sugerido={`Sprint ${sprints.length + 1}`}
            />
          )}
        </section>

        {cerrados.length > 0 && (
          <section aria-label="Sprints cerrados" className="flex flex-col">
            <h3 className="flex items-baseline justify-between border-b border-border pb-2 font-sans text-sm font-semibold text-text-primary">
              Cerrados
              {velocidad.media !== null && (
                <span className="font-normal text-xs text-text-secondary">
                  velocidad media: {conUnidad(velocidad.media, velocidad.unidad)} por sprint
                </span>
              )}
            </h3>
            <ul className="flex flex-col">
              {cerrados.map((sprint) => {
                const hecho =
                  velocidad.sprints.find((v) => v.sprint.id === sprint.id)?.hecho ??
                  cuentaPorSprint.get(sprint.id)?.hechas ??
                  0;
                return (
                  <li
                    key={sprint.id}
                    className="flex items-baseline gap-2 border-b border-border py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
                      {sprint.name}
                    </span>
                    <span className="shrink-0 font-sans text-xs text-text-secondary">
                      {rangoDeFechas(sprint)} · terminado: {conUnidad(hecho, velocidad.unidad)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function SprintEnCurso({
  board,
  projectId,
  sprint,
  tasks,
  planeados,
  cuenta,
  canManageSprint,
  velocidadMedia,
}: {
  board: Board;
  projectId: string;
  sprint: Sprint;
  tasks: Task[];
  planeados: Sprint[];
  cuenta: { total: number; hechas: number };
  canManageSprint: boolean;
  velocidadMedia: number | null;
}) {
  const burndown = useMemo(() => calcularBurndown(sprint, tasks), [sprint, tasks]);
  const [cerrando, setCerrando] = useState(false);
  const dias = diasRestantes(sprint);
  const vencido = dias !== null && dias < 1;
  const porcentaje = cuenta.total === 0 ? 0 : Math.round((cuenta.hechas / cuenta.total) * 100);

  return (
    <section
      className="flex flex-col gap-4 border-b border-border pb-8"
      aria-label="Sprint en curso"
    >
      <div className="flex flex-col gap-1">
        <span className="font-sans text-xs uppercase tracking-wide text-text-secondary">
          En curso
        </span>
        <h2 className="font-display text-3xl leading-tight text-text-primary">{sprint.name}</h2>
        {sprint.goal && (
          <p className="font-sans text-sm italic text-text-secondary">{sprint.goal}</p>
        )}
        <p className="font-sans text-xs text-text-secondary">
          {rangoDeFechas(sprint)} ·{' '}
          <span className={vencido ? 'text-warning' : undefined}>{textoDiasRestantes(dias)}</span>
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between font-sans text-xs text-text-secondary">
          <span>
            <span className="text-text-primary tabular-nums">{cuenta.hechas}</span> de{' '}
            <span className="tabular-nums">{cuenta.total}</span> tareas terminadas
          </span>
          <span className="tabular-nums">{porcentaje}%</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>

      {burndown && <BurndownChart datos={burndown} />}
      {burndown && velocidadMedia !== null && (
        <p className="font-sans text-xs text-text-secondary">
          Comprometido: {conUnidad(burndown.alcanceOriginal + burndown.anadido, burndown.unidad)} ·
          velocidad media de los últimos sprints: {conUnidad(velocidadMedia, burndown.unidad)}
        </p>
      )}

      {canManageSprint &&
        (cerrando ? (
          <CierreDeSprint
            board={board}
            projectId={projectId}
            sprint={sprint}
            tasks={tasks}
            planeados={planeados}
            onCancelar={() => setCerrando(false)}
          />
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setCerrando(true)}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-text-primary transition-colors hover:border-border-strong"
            >
              Cerrar sprint
            </button>
          </div>
        ))}
    </section>
  );
}

type Decision = 'backlog' | 'nextSprint';

/**
 * Cerrar el sprint en curso (D6): cada tarea sin terminar necesita una
 * decisión — backlog o siguiente sprint—. No hay opción preseleccionada: los
 * dos atajos de arriba deciden todas de golpe, pero hay que pulsarlos.
 *
 * La lista de pendientes sale de las tareas que ya hay en pantalla; si el
 * servidor ve otra —alguien movió una tarjeta mientras tanto— responde 409 con
 * la suya, y esa pasa a mandar.
 */
function CierreDeSprint({
  board,
  projectId,
  sprint,
  tasks,
  planeados,
  onCancelar,
}: {
  board: Board;
  projectId: string;
  sprint: Sprint;
  tasks: Task[];
  planeados: Sprint[];
  onCancelar: () => void;
}) {
  const [estado, cerrar, enviando] = useAccion(closeSprintAction, CLOSE_SPRINT_INITIAL_STATE);

  const locales: PendingSprintTask[] = useMemo(
    () =>
      tasks
        .filter((t) => t.sprintId === sprint.id && !t.completedAt)
        .map((t) => ({
          id: t.id,
          title: t.title,
          columnId: t.columnId,
          status: t.status,
          priority: t.priority,
        })),
    [tasks, sprint.id],
  );
  const pendientes = estado.pending ?? locales;

  const [decisiones, setDecisiones] = useState<Map<string, Decision>>(() => new Map());
  const [siguiente, setSiguiente] = useState(planeados[0]?.id ?? '');

  /* Si el elegido desaparece de la lista (se inició en otra pestaña), manda el
     primero que quede. Derivado, no sincronizado con un efecto. */
  const siguienteValido = planeados.some((p) => p.id === siguiente)
    ? siguiente
    : (planeados[0]?.id ?? '');

  const hayPlaneado = planeados.length > 0;
  const faltan = pendientes.filter((t) => !decisiones.has(t.id)).length;
  const alSiguiente = pendientes.some((t) => decisiones.get(t.id) === 'nextSprint');

  function decidirTodas(d: Decision) {
    setDecisiones(new Map(pendientes.map((t) => [t.id, d])));
  }

  function enviar() {
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('sprintId', sprint.id);
    datos.set('resolutions', pendientes.map((t) => `${t.id}:${decisiones.get(t.id)}`).join(','));
    if (alSiguiente) datos.set('nextSprintId', siguienteValido);
    cerrar(datos);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p className="font-sans text-sm text-text-primary">
        {pendientes.length === 0
          ? `Todo lo de «${sprint.name}» está terminado. Al cerrarlo pasa al historial.`
          : pendientes.length === 1
            ? 'Queda una tarea sin terminar. ¿Qué hacemos con ella?'
            : `Quedan ${pendientes.length} tareas sin terminar. ¿Qué hacemos con cada una?`}
      </p>

      {pendientes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
            <span className="text-text-secondary">Todas:</span>
            <button
              type="button"
              onClick={() => decidirTodas('backlog')}
              className="cursor-pointer text-text-primary underline decoration-dotted underline-offset-4"
            >
              al backlog
            </button>
            {hayPlaneado && (
              <button
                type="button"
                onClick={() => decidirTodas('nextSprint')}
                className="cursor-pointer text-text-primary underline decoration-dotted underline-offset-4"
              >
                al siguiente sprint
              </button>
            )}
          </div>

          <ul className="flex flex-col">
            {pendientes.map((t) => {
              const d = decisiones.get(t.id);
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 border-b border-border py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
                    {t.title}
                  </span>
                  <fieldset className="m-0 flex shrink-0 gap-1 border-0 p-0">
                    <legend className="sr-only">Destino de «{t.title}»</legend>
                    <Opcion
                      activa={d === 'backlog'}
                      onClick={() => setDecisiones(new Map(decisiones).set(t.id, 'backlog'))}
                    >
                      Backlog
                    </Opcion>
                    <Opcion
                      activa={d === 'nextSprint'}
                      deshabilitada={!hayPlaneado}
                      onClick={() => setDecisiones(new Map(decisiones).set(t.id, 'nextSprint'))}
                    >
                      Siguiente
                    </Opcion>
                  </fieldset>
                </li>
              );
            })}
          </ul>

          {hayPlaneado ? (
            alSiguiente && (
              <label className="flex items-center gap-2 font-sans text-xs text-text-secondary">
                Siguiente sprint:
                <select
                  value={siguienteValido}
                  onChange={(e) => setSiguiente(e.target.value)}
                  className="cursor-pointer rounded-lg border border-border bg-transparent px-2 py-1 text-text-primary focus:border-primary focus:outline-none"
                >
                  {planeados.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : (
            <p className="font-sans text-xs text-text-secondary">
              No hay ningún sprint planeado: planea uno abajo si quieres pasarle tareas.
            </p>
          )}
        </>
      )}

      {estado.error && (
        <p role="alert" className="font-sans text-xs text-error">
          {estado.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || faltan > 0}
          className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 font-sans text-xs font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enviando ? 'Cerrando…' : faltan > 0 ? `Faltan ${faltan} por decidir` : 'Cerrar sprint'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="cursor-pointer px-2 py-1.5 font-sans text-xs text-text-secondary hover:text-text-primary"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Opcion({
  activa,
  deshabilitada = false,
  onClick,
  children,
}: {
  activa: boolean;
  deshabilitada?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      disabled={deshabilitada}
      onClick={onClick}
      className={`cursor-pointer rounded-md px-2 py-1 font-sans text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        activa ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function SprintPlaneado({
  board,
  projectId,
  sprint,
  tareas,
  puedeIniciar,
}: {
  board: Board;
  projectId: string;
  sprint: Sprint;
  tareas: number;
  puedeIniciar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, iniciar, iniciando] = useAccion(startSprintAction, SPRINT_INITIAL_STATE);
  const porDefecto = useMemo(() => fechasPorDefecto(), []);

  /* El `tzOffset` va con el envío para que «del 1 al 14» sean días locales de
     quien lo arranca, no del servidor. Ver `startSprintAction`. */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    datos.set('tzOffset', String(new Date().getTimezoneOffset()));
    iniciar(datos);
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-2 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
          {sprint.name}
        </span>
        <span className="shrink-0 font-sans text-xs text-text-secondary">
          {tareas} {tareas === 1 ? 'tarea' : 'tareas'}
        </span>
        {puedeIniciar && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="shrink-0 cursor-pointer font-sans text-xs font-medium text-primary hover:underline"
          >
            Iniciar
          </button>
        )}
      </div>
      {sprint.goal && <p className="font-sans text-xs italic text-text-secondary">{sprint.goal}</p>}

      {abierto && (
        <form onSubmit={enviar} className="flex flex-wrap items-end gap-3 pb-1">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="boardId" value={board.id} />
          <input type="hidden" name="sprintId" value={sprint.id} />
          <label className="flex flex-col gap-1 font-sans text-[11px] text-text-secondary">
            Empieza
            <input
              type="date"
              name="startDate"
              defaultValue={porDefecto.inicio}
              required
              className="rounded-lg border border-border bg-transparent px-2 py-1 text-xs text-text-primary [color-scheme:dark] focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 font-sans text-[11px] text-text-secondary">
            Termina
            <input
              type="date"
              name="endDate"
              defaultValue={porDefecto.fin}
              required
              className="rounded-lg border border-border bg-transparent px-2 py-1 text-xs text-text-primary [color-scheme:dark] focus:border-primary focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={iniciando}
            className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 font-sans text-xs font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {iniciando ? 'Iniciando…' : 'Iniciar sprint'}
          </button>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="cursor-pointer px-1 py-1.5 font-sans text-xs text-text-secondary hover:text-text-primary"
          >
            Cancelar
          </button>
          {estado.error && (
            <p role="alert" className="w-full font-sans text-xs text-error">
              {estado.error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

function NuevoSprint({
  board,
  projectId,
  sugerido,
}: {
  board: Board;
  projectId: string;
  sugerido: string;
}) {
  const [estado, crear, creando] = useAccion(createSprintAction, SPRINT_INITIAL_STATE);

  return (
    /* `action=` a propósito: es un formulario de alta, vaciarse al enviar es lo
       que se quiere (ver CLAUDE.md, el reseteo de React 19). */
    <form action={crear} className="flex flex-col gap-2 pt-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="boardId" value={board.id} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={sugerido}
          key={sugerido}
          aria-label="Nombre del sprint"
          className="min-w-0 flex-1 border-b border-border bg-transparent py-1 font-sans text-sm text-text-primary outline-none focus:border-primary"
        />
        <input
          name="goal"
          maxLength={500}
          placeholder="Meta (opcional)"
          aria-label="Meta del sprint"
          className="min-w-0 flex-[2] border-b border-border bg-transparent py-1 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-primary"
        />
        <button
          type="submit"
          disabled={creando}
          className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1 font-sans text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60"
        >
          {creando ? 'Planeando…' : 'Planear sprint'}
        </button>
      </div>
      {estado.error && (
        <p role="alert" className="font-sans text-xs text-error">
          {estado.error}
        </p>
      )}
    </form>
  );
}
