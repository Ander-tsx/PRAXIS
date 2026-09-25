'use client';

import { updateSprintAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  Button,
  FloatingLabelInput,
  FloatingLabelTextarea,
  SelectorDeFecha,
  SlideOver,
  type Sprint,
  type SprintMetrics,
  type Task,
  type UserProfile,
  colors,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { type FormEvent, type ReactNode, useMemo } from 'react';
import { BurndownChart } from './BurndownChart';
import { type Unidad, calcularBurndown, calcularVelocidad, conUnidad, valor } from './burndown';
import { diaDe, diasRestantes, rangoDeFechas, sprintsCerrados, textoDiasRestantes } from './scrum';

export interface SprintPanelProps {
  abierto: boolean;
  onCerrar: () => void;
  board: Board;
  projectId: string;
  sprint: Sprint;
  sprints: Sprint[];
  /** Las tareas del sprint: las del tablero. */
  tareas: Task[];
  metricas: SprintMetrics;
  unidad: Unidad;
  usersById: Map<string, UserProfile>;
  canManageSprint: boolean;
  onEmpezar: () => void;
  onCerrarSprint: () => void;
  onDescartar: () => void;
}

/**
 * Todo el sprint en un panel lateral, como el del backlog y el de la tarea
 * (D21 de `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * Sustituye al `⋯` de la franja, que competía con el `⋯` del tablero a un
 * palmo —dos menús iguales para cosas distintas—, y a los diálogos de editar y
 * de progreso. Aquí se lee y se edita el sprint sin salir del tablero:
 *
 * 1. nombre, meta y fechas, editables en el sitio;
 * 2. cómo va (tiempo frente a trabajo) y el burndown;
 * 3. **quién lleva qué** —la pregunta de la daily—;
 * 4. los sprints anteriores con lo que dejó cada cierre: la revisión.
 *
 * Empezar, cerrar y descartar siguen siendo diálogos: son decisiones, no
 * consultas.
 */
export function SprintPanel({
  abierto,
  onCerrar,
  board,
  projectId,
  sprint,
  sprints,
  tareas,
  metricas,
  unidad,
  usersById,
  canManageSprint,
  onEmpezar,
  onCerrarSprint,
  onDescartar,
}: SprintPanelProps) {
  const enCurso = sprint.status === 'ACTIVE';
  const dias = enCurso ? diasRestantes(sprint) : null;

  return (
    <SlideOver
      open={abierto}
      onClose={onCerrar}
      /* El ancho del panel de tarea: las fechas largas caben en una línea y
         pasar de uno a otro no mueve el tablero. */
      size="xl"
      tone="dark"
      ariaLabel="Sprint"
      etiquetaDeVuelta={sprint.name}
      title={sprint.name}
      description={
        <span className="flex flex-wrap items-center gap-2 text-text-secondary">
          <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-text-primary">
            {enCurso ? 'En curso' : 'Sin empezar'}
          </span>
          {enCurso && (
            <span className="text-xs">
              {[rangoDeFechas(sprint), textoDiasRestantes(dias)].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      }
    >
      {abierto && (
        <div className="flex flex-col gap-8 pb-6">
          <Datos
            key={`${sprint.id}:${sprint.name}:${sprint.goal}:${sprint.endDate}`}
            board={board}
            projectId={projectId}
            sprint={sprint}
            editable={canManageSprint}
          />
          {enCurso && <Progreso sprint={sprint} metricas={metricas} unidad={unidad} />}
          <PorPersona tareas={tareas} unidad={unidad} usersById={usersById} />
          <Anteriores sprints={sprints} metricas={metricas} unidad={unidad} />

          {canManageSprint && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-6">
              {enCurso ? (
                <Button onClick={onCerrarSprint}>Cerrar sprint</Button>
              ) : (
                <>
                  <Button onClick={onEmpezar}>Empezar sprint</Button>
                  <Button variant="ghost" onClick={onDescartar}>
                    Descartar
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </SlideOver>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/**
 * Nombre, meta y fechas. Formulario **de edición**: `onSubmit` con el
 * `FormData` a mano, nunca `action=`, o React lo resetea al guardar
 * (`CLAUDE.md`). Se remonta con `key` cuando llega el sprint guardado.
 */
function Datos({
  board,
  projectId,
  sprint,
  editable,
}: {
  board: Board;
  projectId: string;
  sprint: Sprint;
  editable: boolean;
}) {
  const [estado, guardar, guardando] = useAccion(updateSprintAction, SPRINT_INITIAL_STATE);
  const enCurso = sprint.status === 'ACTIVE';
  const inicio = diaDe(sprint.startDate);
  const fin = diaDe(sprint.endDate);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('sprintId', sprint.id);
    datos.set('enCurso', String(enCurso));
    datos.set('tzOffset', String(new Date().getTimezoneOffset()));
    if (enCurso && inicio) datos.set('startDate', inicio);
    /* Un planeado sin fechas todavía: no se mandan, se fijan al empezar. */
    if (!datos.get('endDate')) {
      datos.delete('endDate');
      datos.delete('startDate');
    }
    guardar(datos);
  }

  if (!editable) {
    return (
      <Seccion titulo="Meta">
        <p className="font-sans text-sm text-text-primary">
          {sprint.goal || <span className="text-text-secondary">Sin meta</span>}
        </p>
      </Seccion>
    );
  }

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4">
      <FloatingLabelInput
        id="sprint-nombre"
        name="name"
        label="Nombre"
        defaultValue={sprint.name}
        required
        minLength={2}
        maxLength={100}
      />
      <FloatingLabelTextarea
        id="sprint-meta"
        name="goal"
        label="Meta"
        defaultValue={sprint.goal ?? ''}
        rows={2}
        maxLength={500}
      />
      {(inicio || fin) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectorDeFecha
            name="startDate"
            label="Empieza"
            defaultValue={inicio ?? ''}
            disabled={enCurso}
          />
          <SelectorDeFecha name="endDate" label="Termina" defaultValue={fin ?? ''} align="right" />
        </div>
      )}
      {estado.error && (
        <p role="alert" className="font-sans text-xs text-error">
          {estado.error}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" size="sm" isLoading={guardando}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

function Progreso({
  sprint,
  metricas,
  unidad,
}: {
  sprint: Sprint;
  metricas: SprintMetrics;
  unidad: Unidad;
}) {
  const burndown = useMemo(
    () => calcularBurndown(sprint, metricas.tasks, unidad),
    [sprint, metricas.tasks, unidad],
  );
  const delSprint = metricas.tasks.filter((t) => t.sprintId === sprint.id);
  const total = delSprint.reduce((s, t) => s + valor(t, unidad), 0);
  const hecho = delSprint.filter((t) => t.completedAt).reduce((s, t) => s + valor(t, unidad), 0);
  const totalDias = burndown?.dias.length ?? 0;
  const dias = diasRestantes(sprint);
  const transcurridos = dias === null ? 0 : Math.min(totalDias, Math.max(0, totalDias - dias + 1));
  const pctTiempo = totalDias === 0 ? 0 : Math.round((transcurridos / totalDias) * 100);
  const pctTrabajo = total === 0 ? 0 : Math.round((hecho / total) * 100);
  const vencido = dias !== null && dias < 1;
  const diferencia = pctTrabajo - pctTiempo;
  /* Los primeros días no hay nada que juzgar: sin trabajo cerrado todavía,
     todo sprint parecería ir «por detrás». */
  const veredicto =
    total === 0
      ? 'El sprint está vacío.'
      : pctTrabajo === 100
        ? 'Todo hecho.'
        : vencido
          ? 'Se acabó el tiempo.'
          : transcurridos <= 1
            ? 'Acaba de empezar.'
            : diferencia >= 10
              ? 'Van por delante del ritmo.'
              : diferencia <= -15
                ? 'Van por detrás del ritmo.'
                : 'Van al ritmo.';

  return (
    <Seccion titulo="Cómo va">
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
      <p className="font-sans text-sm font-medium text-text-primary">{veredicto}</p>
      {burndown && total > 0 && (
        <div className="pt-2">
          <BurndownChart datos={burndown} />
        </div>
      )}
    </Seccion>
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
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${porcentaje}%`, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * Quién lleva qué en el sprint (R4): la pregunta de la daily. Una fila por
 * persona con lo suyo hecho y comprometido; lo que no tiene encargado, al
 * final, porque también es una respuesta («esto no lo lleva nadie»).
 */
function PorPersona({
  tareas,
  unidad,
  usersById,
}: {
  tareas: Task[];
  unidad: Unidad;
  usersById: Map<string, UserProfile>;
}) {
  const filas = useMemo(() => {
    const porId = new Map<string, { total: number; hecho: number; tareas: number }>();
    for (const t of tareas) {
      const ids = t.assignees?.length ? t.assignees.map((a) => a.userId) : [''];
      for (const id of ids) {
        const actual = porId.get(id) ?? { total: 0, hecho: 0, tareas: 0 };
        actual.total += valor(t, unidad);
        actual.tareas += 1;
        if (t.completedAt) actual.hecho += valor(t, unidad);
        porId.set(id, actual);
      }
    }
    return [...porId.entries()].sort(([a, x], [b, y]) =>
      a === '' ? 1 : b === '' ? -1 : y.total - x.total,
    );
  }, [tareas, unidad]);

  if (filas.length === 0) return null;

  return (
    <Seccion titulo="Quién lleva qué">
      <ul className="flex flex-col">
        {filas.map(([id, f]) => {
          const persona = id ? usersById.get(id) : undefined;
          const pct = f.total === 0 ? 0 : Math.round((f.hecho / f.total) * 100);
          return (
            <li
              key={id || 'sin-encargado'}
              className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-3 border-b border-border py-2 font-sans text-sm last:border-b-0"
            >
              <span className={`truncate ${id ? 'text-text-primary' : 'text-text-secondary'}`}>
                {persona ? personLabel(persona) : id ? 'Persona eliminada' : 'Sin encargado'}
              </span>
              <span
                className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
                aria-hidden="true"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="text-right font-sans text-xs tabular-nums text-text-secondary">
                {f.hecho}/{conUnidad(f.total, unidad)}
              </span>
            </li>
          );
        })}
      </ul>
    </Seccion>
  );
}

/**
 * Los sprints cerrados, con lo que dejó cada cierre (S15): la revisión sin
 * tener que reconstruirla. La barra es lo terminado, comparable entre sprints.
 */
function Anteriores({
  sprints,
  metricas,
  unidad,
}: {
  sprints: Sprint[];
  metricas: SprintMetrics;
  unidad: Unidad;
}) {
  const cerrados = useMemo(() => sprintsCerrados(sprints), [sprints]);
  const velocidad = useMemo(
    () =>
      calcularVelocidad(
        cerrados.filter((s) => metricas.velocitySprintIds.includes(s.id)),
        metricas.tasks,
        unidad,
      ),
    [cerrados, metricas, unidad],
  );
  if (cerrados.length === 0) return null;

  const hechoDe = (s: Sprint) =>
    velocidad.sprints.find((v) => v.sprint.id === s.id)?.hecho ??
    (unidad === 'puntos' ? (s.closeSummary?.puntosHechos ?? 0) : (s.closeSummary?.hechas ?? 0));
  const maximo = Math.max(1, ...cerrados.map(hechoDe));

  return (
    <Seccion titulo="Sprints anteriores">
      {velocidad.media !== null && (
        <p className="-mt-1 font-sans text-xs text-text-secondary">
          El equipo termina de media {conUnidad(velocidad.media, unidad)} por sprint.
        </p>
      )}
      <ul className="flex flex-col">
        {cerrados.map((s) => {
          const hecho = hechoDe(s);
          const r = s.closeSummary;
          return (
            <li
              key={s.id}
              className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-3 font-sans text-sm">
                <span className="truncate text-text-primary">{s.name}</span>
                <span
                  className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(hecho / maximo) * 100}%` }}
                  />
                </span>
                <span className="text-right text-xs tabular-nums text-text-secondary">
                  {conUnidad(hecho, unidad)}
                </span>
              </div>
              <p className="font-sans text-xs text-text-secondary">
                {[
                  rangoDeFechas(s),
                  s.goal,
                  r &&
                    [
                      `${r.hechas} ${r.hechas === 1 ? 'terminada' : 'terminadas'}`,
                      r.alSiguiente > 0 && `${r.alSiguiente} pasaron al siguiente`,
                      r.alBacklog > 0 && `${r.alBacklog} al backlog`,
                    ]
                      .filter(Boolean)
                      .join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          );
        })}
      </ul>
    </Seccion>
  );
}
