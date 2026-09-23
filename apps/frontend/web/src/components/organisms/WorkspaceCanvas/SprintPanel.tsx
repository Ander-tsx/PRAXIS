'use client';

import {
  closeSprintAction,
  startNewSprintAction,
} from '@/app/(privado)/projects/[id]/sprint-actions';
import { CLOSE_SPRINT_INITIAL_STATE, SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  type PendingSprintTask,
  type Sprint,
  type Task,
  colors,
  useAccion,
} from '@praxis/commons';
import { type ReactNode, useMemo, useState } from 'react';
import { BurndownChart } from './BurndownChart';
import { calcularBurndown, calcularVelocidad, conUnidad, unidadDe } from './burndown';
import {
  diasRestantes,
  fechasPorDefecto,
  rangoDeFechas,
  sprintActivo,
  sprintsCerrados,
  textoDiasRestantes,
} from './scrum';

export interface SprintPanelProps {
  board: Board;
  projectId: string;
  /** Todas las tareas del tablero. */
  tasks: Task[];
  sprints: Sprint[];
  /** Empezar y cerrar: `canManageSprint`. */
  canManageSprint: boolean;
}

/**
 * La vista **Sprint** (D16 de `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * Tres preguntas, en este orden, y cada una con su respuesta a la vista:
 *
 * 1. **¿Hay sprint?** Si no, un solo formulario: empezarlo.
 * 2. **¿Cómo vamos?** Dos barras que se comparan solas —tiempo gastado y
 *    trabajo hecho— y una frase que lo dice. El burndown debajo, para quien
 *    quiera el detalle.
 * 3. **¿Cómo fueron los anteriores?** Lo terminado en cada uno, en barras: la
 *    velocidad sin tener que saber qué es.
 */
export function SprintPanel({
  board,
  projectId,
  tasks,
  sprints,
  canManageSprint,
}: SprintPanelProps) {
  const activo = sprintActivo(sprints);
  const cerrados = useMemo(() => sprintsCerrados(sprints), [sprints]);
  const velocidad = useMemo(() => calcularVelocidad(cerrados, tasks), [cerrados, tasks]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 pb-10 pt-2">
        {activo ? (
          <SprintEnCurso
            board={board}
            projectId={projectId}
            sprint={activo}
            tasks={tasks}
            canManageSprint={canManageSprint}
            velocidadMedia={velocidad.media}
            sugerido={`Sprint ${sprints.length + 1}`}
          />
        ) : canManageSprint ? (
          <EmpezarSprint
            board={board}
            projectId={projectId}
            sugerido={`Sprint ${sprints.length + 1}`}
            enBacklog={tasks.filter((t) => t.sprintId === null).length}
          />
        ) : (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-3xl text-text-primary">Ningún sprint en curso</h2>
            <p className="font-sans text-sm text-text-secondary">
              Quien gestione los sprints de este tablero puede empezar el siguiente.
            </p>
          </section>
        )}

        {velocidad.sprints.length > 0 && <Historial velocidad={velocidad} />}
      </div>
    </div>
  );
}

/* ─── Empezar ───────────────────────────────────────────────────────────── */

function EmpezarSprint({
  board,
  projectId,
  sugerido,
  enBacklog,
}: {
  board: Board;
  projectId: string;
  sugerido: string;
  enBacklog: number;
}) {
  const [estado, empezar, empezando] = useAccion(startNewSprintAction, SPRINT_INITIAL_STATE);
  const porDefecto = useMemo(() => fechasPorDefecto(), []);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    datos.set('tzOffset', String(new Date().getTimezoneOffset()));
    empezar(datos);
  }

  return (
    <section className="flex flex-col gap-6" aria-label="Empezar un sprint">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl text-text-primary">Empieza un sprint</h2>
        <p className="max-w-xl font-sans text-sm leading-relaxed text-text-secondary">
          Un sprint es un bloque de tiempo con una meta. Mientras dura, el tablero enseña solo lo
          que el equipo se comprometió a terminar; lo demás espera en el backlog
          {enBacklog > 0 && ` (ahora hay ${enBacklog} ${enBacklog === 1 ? 'tarea' : 'tareas'})`}.
        </p>
      </div>

      <form onSubmit={enviar} className="flex flex-col gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="boardId" value={board.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={sugerido}
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Meta (opcional)">
            <input
              name="goal"
              maxLength={500}
              placeholder="Qué tiene que estar hecho al final"
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Empieza">
            <input
              type="date"
              name="startDate"
              required
              defaultValue={porDefecto.inicio}
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Termina">
            <input
              type="date"
              name="endDate"
              required
              defaultValue={porDefecto.fin}
              className={CAMPO}
            />
          </Campo>
        </div>
        {estado.error && (
          <p role="alert" className="font-sans text-xs text-error">
            {estado.error}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={empezando}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {empezando ? 'Empezando…' : 'Empezar sprint'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ─── En curso ──────────────────────────────────────────────────────────── */

function SprintEnCurso({
  board,
  projectId,
  sprint,
  tasks,
  canManageSprint,
  velocidadMedia,
  sugerido,
}: {
  board: Board;
  projectId: string;
  sprint: Sprint;
  tasks: Task[];
  canManageSprint: boolean;
  velocidadMedia: number | null;
  sugerido: string;
}) {
  const [cerrando, setCerrando] = useState(false);
  const burndown = useMemo(() => calcularBurndown(sprint, tasks), [sprint, tasks]);
  const delSprint = useMemo(
    () => tasks.filter((t) => t.sprintId === sprint.id),
    [tasks, sprint.id],
  );
  const unidad = unidadDe(delSprint);
  const valor = (t: Task) => (unidad === 'puntos' ? (t.estimatePoints ?? 0) : 1);
  const total = delSprint.reduce((s, t) => s + valor(t), 0);
  const hecho = delSprint.filter((t) => t.completedAt).reduce((s, t) => s + valor(t), 0);

  const totalDias = burndown?.dias.length ?? 0;
  const dias = diasRestantes(sprint);
  const transcurridos = dias === null ? 0 : Math.min(totalDias, Math.max(0, totalDias - dias + 1));
  const pctTiempo = totalDias === 0 ? 0 : Math.round((transcurridos / totalDias) * 100);
  const pctTrabajo = total === 0 ? 0 : Math.round((hecho / total) * 100);
  const vencido = dias !== null && dias < 1;

  const diferencia = pctTrabajo - pctTiempo;
  const veredicto =
    total === 0
      ? 'El sprint está vacío: trae tareas desde el backlog.'
      : pctTrabajo === 100
        ? 'Todo hecho. Puedes cerrarlo.'
        : vencido
          ? 'Se acabó el tiempo. Ciérralo y decide qué pasa con lo pendiente.'
          : diferencia >= 10
            ? 'Vais por delante del ritmo.'
            : diferencia <= -15
              ? 'Vais por detrás del ritmo: queda más trabajo que tiempo.'
              : 'Vais al ritmo.';

  const porColumna = useMemo(
    () =>
      [...board.columns]
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ columna: c, n: delSprint.filter((t) => t.columnId === c.id).length })),
    [board.columns, delSprint],
  );

  return (
    <section className="flex flex-col gap-8" aria-label="Sprint en curso">
      <header className="flex flex-col gap-2">
        <span className="font-sans text-xs text-text-secondary">
          En curso · {rangoDeFechas(sprint)} ·{' '}
          <span className={vencido ? 'text-warning' : undefined}>{textoDiasRestantes(dias)}</span>
        </span>
        <h2 className="font-display text-4xl leading-tight text-text-primary">{sprint.name}</h2>
        {sprint.goal && <p className="font-sans text-base text-text-secondary">{sprint.goal}</p>}
      </header>

      <div className="flex flex-col gap-4">
        <Barra
          etiqueta="Tiempo"
          detalle={`día ${transcurridos} de ${totalDias}`}
          porcentaje={pctTiempo}
          color={vencido ? colors.warning : colors.textSecondary}
        />
        <Barra
          etiqueta="Trabajo"
          detalle={`${conUnidad(hecho, unidad)} de ${conUnidad(total, unidad)}`}
          porcentaje={pctTrabajo}
          color={colors.primary}
        />
        <p className="font-sans text-sm text-text-primary">{veredicto}</p>
        {velocidadMedia !== null && total > 0 && (
          <p className="font-sans text-xs text-text-secondary">
            En los últimos sprints el equipo terminó de media {conUnidad(velocidadMedia, unidad)}
            {total > velocidadMedia * 1.2 ? ': este va más cargado de lo habitual.' : '.'}
          </p>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-3">
        {porColumna.map(({ columna, n }) => (
          <li key={columna.id} className="flex items-baseline gap-2 font-sans text-sm">
            <span
              className="h-2 w-2 self-center rounded-full"
              style={{ background: colors[columna.color] ?? colors.primary }}
              aria-hidden="true"
            />
            <span className="text-text-secondary">{columna.name}</span>
            <span className="tabular-nums text-text-primary">{n}</span>
          </li>
        ))}
      </ul>

      {burndown && total > 0 && (
        <div className="flex flex-col gap-2">
          <BurndownChart datos={burndown} />
          <p className="font-sans text-xs text-text-secondary">
            La línea gris es el ritmo para terminar justo a tiempo. Si la tuya va por debajo, vais
            bien; si sube, entró trabajo nuevo al sprint.
          </p>
        </div>
      )}

      {canManageSprint &&
        (cerrando ? (
          <CierreDeSprint
            board={board}
            projectId={projectId}
            sprint={sprint}
            tasks={tasks}
            sugerido={sugerido}
            onCancelar={() => setCerrando(false)}
          />
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setCerrando(true)}
              className="cursor-pointer rounded-lg border border-border px-4 py-2 font-sans text-sm font-medium text-text-primary transition-colors hover:border-border-strong"
            >
              Cerrar sprint
            </button>
          </div>
        ))}
    </section>
  );
}

function Barra({
  etiqueta,
  detalle,
  porcentaje,
  color,
}: {
  etiqueta: string;
  detalle: string;
  porcentaje: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between font-sans text-xs">
        <span className="font-medium text-text-primary">{etiqueta}</span>
        <span className="tabular-nums text-text-secondary">
          {detalle} · {porcentaje}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${porcentaje}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* ─── Cerrar ────────────────────────────────────────────────────────────── */

type Decision = 'backlog' | 'nextSprint';

/**
 * Cerrar el sprint (D6): cada tarea sin terminar necesita decisión. Si alguna
 * pasa al siguiente sprint, aquí mismo se le pone nombre y fechas, y arranca
 * en cuanto este se cierra (D16).
 */
function CierreDeSprint({
  board,
  projectId,
  sprint,
  tasks,
  sugerido,
  onCancelar,
}: {
  board: Board;
  projectId: string;
  sprint: Sprint;
  tasks: Task[];
  sugerido: string;
  onCancelar: () => void;
}) {
  const [estado, cerrar, enviando] = useAccion(closeSprintAction, CLOSE_SPRINT_INITIAL_STATE);
  const porDefecto = useMemo(() => fechasPorDefecto(), []);

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
  const [siguiente, setSiguiente] = useState({
    nombre: sugerido,
    inicio: porDefecto.inicio,
    fin: porDefecto.fin,
  });

  const faltan = pendientes.filter((t) => !decisiones.has(t.id)).length;
  const alSiguiente = pendientes.some((t) => decisiones.get(t.id) === 'nextSprint');

  function enviar() {
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('sprintId', sprint.id);
    datos.set('resolutions', pendientes.map((t) => `${t.id}:${decisiones.get(t.id)}`).join(','));
    if (alSiguiente) {
      datos.set('nextName', siguiente.nombre);
      datos.set('nextstartDate', siguiente.inicio);
      datos.set('nextendDate', siguiente.fin);
      datos.set('tzOffset', String(new Date().getTimezoneOffset()));
    }
    cerrar(datos);
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-6">
      <h3 className="font-sans text-base font-semibold text-text-primary">
        Cerrar «{sprint.name}»
      </h3>
      <p className="font-sans text-sm text-text-secondary">
        {pendientes.length === 0
          ? 'Todo está terminado. Al cerrarlo pasa al historial.'
          : pendientes.length === 1
            ? 'Queda una tarea sin terminar. ¿Vuelve al backlog o pasa al siguiente sprint?'
            : `Quedan ${pendientes.length} tareas sin terminar. Decide qué pasa con cada una.`}
      </p>

      {pendientes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 font-sans text-xs">
            <span className="text-text-secondary">Todas:</span>
            <button
              type="button"
              onClick={() => setDecisiones(new Map(pendientes.map((t) => [t.id, 'backlog'])))}
              className="cursor-pointer text-text-primary underline decoration-dotted underline-offset-4"
            >
              al backlog
            </button>
            <button
              type="button"
              onClick={() => setDecisiones(new Map(pendientes.map((t) => [t.id, 'nextSprint'])))}
              className="cursor-pointer text-text-primary underline decoration-dotted underline-offset-4"
            >
              al siguiente sprint
            </button>
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
                      onClick={() => setDecisiones(new Map(decisiones).set(t.id, 'nextSprint'))}
                    >
                      Siguiente sprint
                    </Opcion>
                  </fieldset>
                </li>
              );
            })}
          </ul>

          {alSiguiente && (
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
              <p className="font-sans text-xs text-text-secondary sm:col-span-3">
                El siguiente sprint empieza en cuanto cierres este:
              </p>
              <Campo etiqueta="Nombre">
                <input
                  value={siguiente.nombre}
                  onChange={(e) => setSiguiente({ ...siguiente, nombre: e.target.value })}
                  maxLength={100}
                  className={CAMPO}
                />
              </Campo>
              <Campo etiqueta="Empieza">
                <input
                  type="date"
                  value={siguiente.inicio}
                  onChange={(e) => setSiguiente({ ...siguiente, inicio: e.target.value })}
                  className={CAMPO}
                />
              </Campo>
              <Campo etiqueta="Termina">
                <input
                  type="date"
                  value={siguiente.fin}
                  onChange={(e) => setSiguiente({ ...siguiente, fin: e.target.value })}
                  className={CAMPO}
                />
              </Campo>
            </div>
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
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enviando
            ? 'Cerrando…'
            : faltan > 0
              ? `Faltan ${faltan} por decidir`
              : alSiguiente
                ? 'Cerrar y empezar el siguiente'
                : 'Cerrar sprint'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="cursor-pointer px-2 py-2 font-sans text-sm text-text-secondary hover:text-text-primary"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Opcion({
  activa,
  onClick,
  children,
}: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`cursor-pointer rounded-md px-2 py-1 font-sans text-xs transition-colors ${
        activa ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Historial ─────────────────────────────────────────────────────────── */

function Historial({ velocidad }: { velocidad: ReturnType<typeof calcularVelocidad> }) {
  const maximo = Math.max(1, ...velocidad.sprints.map((s) => s.hecho));
  return (
    <section aria-label="Sprints anteriores" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h3 className="font-sans text-sm font-semibold text-text-primary">Sprints anteriores</h3>
        {velocidad.media !== null && (
          <span className="font-sans text-xs text-text-secondary">
            media: {conUnidad(velocidad.media, velocidad.unidad)} terminados por sprint
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {velocidad.sprints.map(({ sprint, hecho }) => (
          <li
            key={sprint.id}
            className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 font-sans text-xs"
          >
            <span className="truncate text-text-primary" title={rangoDeFechas(sprint) ?? undefined}>
              {sprint.name}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${(hecho / maximo) * 100}%` }}
              />
            </span>
            <span className="tabular-nums text-text-secondary">
              {conUnidad(hecho, velocidad.unidad)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── Piezas ────────────────────────────────────────────────────────────── */

const CAMPO =
  'w-full rounded-lg border border-border bg-[#1c1c1b] px-2.5 py-1.5 font-sans text-sm text-text-primary outline-none focus:border-primary [color-scheme:dark]';

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-sans text-xs text-text-secondary">
      {etiqueta}
      {children}
    </label>
  );
}
