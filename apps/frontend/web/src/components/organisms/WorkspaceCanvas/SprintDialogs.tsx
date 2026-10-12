'use client';

import {
  closeSprintAction,
  discardSprintAction,
  startSprintAction,
  updateSprintAction,
} from '@/app/(privado)/projects/[id]/sprint-actions';
import { CLOSE_SPRINT_INITIAL_STATE, SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  Button,
  Dialog,
  FloatingLabelInput,
  type PendingSprintTask,
  SelectorDeFecha,
  type Sprint,
  type SprintMetrics,
  type Task,
  colors,
  useAccion,
} from '@praxis/commons';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { BurndownChart } from './BurndownChart';
import { type Unidad, calcularBurndown, calcularVelocidad, conUnidad, valor } from './burndown';
import {
  diaDe,
  diasRestantes,
  fechasPorDefecto,
  rangoDeFechas,
  sprintsCerrados,
  textoDiasRestantes,
} from './scrum';

/**
 * Los diálogos del sprint: las tres **decisiones** —empezar, cerrar,
 * descartar—. Todo lo demás del sprint (meta, fechas, progreso, historial)
 * vive en su panel lateral, `SprintPanel` (D21 de `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * Van en tono cálido (`tone="dark"`): son la paleta de la aplicación, no la
 * azulada de antes.
 */

/** Cierra el diálogo en cuanto la acción confirma, una sola vez por confirmación. */
function useAlConfirmar(done: string | null, onHecho: () => void) {
  const [visto, setVisto] = useState<string | null>(null);
  useEffect(() => {
    if (done && done !== visto) {
      setVisto(done);
      onHecho();
    }
  }, [done, visto, onHecho]);
}

/* ─── Empezar y editar ──────────────────────────────────────────────────── */

/**
 * Empezar el sprint planeado, o editar uno.
 *
 * Es un formulario **de edición** —el sprint ya existe—, así que va por
 * `onSubmit` con el `FormData` a mano y no por `action=`: React resetea los
 * campos no controlados al terminar una acción (ver `CLAUDE.md`).
 */
export function FormularioDeSprint({
  modo,
  abierto,
  onCerrar,
  board,
  projectId,
  sprint,
  tareas,
  unidad,
  velocidadMedia,
}: {
  modo: 'empezar' | 'editar';
  abierto: boolean;
  onCerrar: () => void;
  board: Board;
  projectId: string;
  sprint: Sprint;
  /** Las tareas que ya tiene: al empezar se enseña cuánto se compromete. */
  tareas: Task[];
  unidad: Unidad;
  velocidadMedia: number | null;
}) {
  const [estado, enviar, enviando] = useAccion(
    modo === 'empezar' ? startSprintAction : updateSprintAction,
    SPRINT_INITIAL_STATE,
  );
  useAlConfirmar(estado.done, onCerrar);

  const enCurso = sprint.status === 'ACTIVE';
  const porDefecto = useMemo(() => fechasPorDefecto(), []);
  const inicio = diaDe(sprint.startDate) ?? porDefecto.inicio;
  const fin = diaDe(sprint.endDate) ?? porDefecto.fin;
  const comprometido = tareas.reduce((s, t) => s + valor(t, unidad), 0);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    /* Un segundo envío mientras el primero sigue en vuelo repetía la acción y daba «ya está en
       marcha» sobre un sprint que sí había empezado. */
    if (enviando) return;
    const datos = new FormData(evento.currentTarget);
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('sprintId', sprint.id);
    datos.set('enCurso', String(enCurso));
    datos.set('tzOffset', String(new Date().getTimezoneOffset()));
    /* De uno en curso solo se cambia el final; el inicio viaja para validar. */
    if (enCurso) datos.set('startDate', inicio);
    enviar(datos);
  }

  return (
    <Dialog
      tone="dark"
      open={abierto}
      onClose={onCerrar}
      title={modo === 'empezar' ? `Empezar ${sprint.name}` : 'Editar sprint'}
      size="md"
    >
      <form onSubmit={alEnviar} className="flex flex-col gap-4">
        {modo === 'empezar' && (
          <p className="font-sans text-sm text-text-secondary">
            {tareas.length === 0
              ? 'Todavía no tiene tareas. Arrástralas desde el backlog antes de empezar.'
              : `${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'} · ${conUnidad(comprometido, unidad)}`}
            {velocidadMedia !== null &&
              tareas.length > 0 &&
              ` — el equipo suele terminar ${conUnidad(velocidadMedia, unidad)}.`}
          </p>
        )}
        <FloatingLabelInput
          id="sprint-empezar-nombre"
          name="name"
          label="Nombre"
          defaultValue={sprint.name}
          required
          minLength={2}
          maxLength={100}
        />
        <FloatingLabelInput
          id="sprint-empezar-meta"
          name="goal"
          label="Meta"
          defaultValue={sprint.goal ?? ''}
          maxLength={500}
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectorDeFecha
            name="startDate"
            label="Empieza"
            defaultValue={inicio}
            disabled={enCurso}
          />
          <SelectorDeFecha name="endDate" label="Termina" defaultValue={fin} align="right" />
        </div>
        {estado.error && (
          <p role="alert" className="font-sans text-xs text-error">
            {estado.error}
          </p>
        )}
        {enviando && (
          <output className="block font-sans text-xs text-text-secondary">
            {modo === 'empezar' ? 'Empezando el sprint…' : 'Guardando…'}
          </output>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={enviando}>
            {modo === 'empezar' ? 'Empezar sprint' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ─── Cerrar ────────────────────────────────────────────────────────────── */

type Decision = 'backlog' | 'nextSprint';

/**
 * Cerrar el sprint (D6): cada tarea sin terminar necesita destino.
 *
 * Por defecto **pasan al siguiente**, que es lo que se hace casi siempre; se
 * puede cambiar una a una. Lo que pasa entra en el sprint planeado —o en uno
 * nuevo con el nombre de aquí— con su columna de siempre, y el tablero pasa a
 * enseñar ese sprint para planificarlo antes de empezarlo (D19).
 */
export function CerrarSprintDialog({
  abierto,
  onCerrar,
  board,
  projectId,
  sprint,
  tareas,
  planeado,
  nombreSiguiente,
}: {
  abierto: boolean;
  onCerrar: () => void;
  board: Board;
  projectId: string;
  sprint: Sprint;
  tareas: Task[];
  /** El siguiente, si ya está planeado: lo pendiente va a él. */
  planeado: Sprint | null;
  nombreSiguiente: string;
}) {
  const [estado, cerrar, enviando] = useAccion(closeSprintAction, CLOSE_SPRINT_INITIAL_STATE);
  useAlConfirmar(estado.done, onCerrar);

  const hechas = tareas.filter((t) => t.completedAt).length;
  const locales: PendingSprintTask[] = useMemo(
    () =>
      tareas
        .filter((t) => !t.completedAt)
        .map((t) => ({
          id: t.id,
          title: t.title,
          columnId: t.columnId,
          status: t.status,
          priority: t.priority,
        })),
    [tareas],
  );
  const pendientes = estado.pending ?? locales;

  const [aBacklog, setABacklog] = useState<Set<string>>(() => new Set());
  const [nombre, setNombre] = useState(nombreSiguiente);
  const decision = (id: string): Decision => (aBacklog.has(id) ? 'backlog' : 'nextSprint');
  const alSiguiente = pendientes.some((t) => decision(t.id) === 'nextSprint');

  function alternar(id: string) {
    setABacklog((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function enviar() {
    if (enviando) return;
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('sprintId', sprint.id);
    datos.set('resolutions', pendientes.map((t) => `${t.id}:${decision(t.id)}`).join(','));
    if (alSiguiente && !planeado) datos.set('nextName', nombre);
    cerrar(datos);
  }

  const columnaDe = (id: string) => board.columns.find((c) => c.id === id)?.name ?? '';

  return (
    <Dialog tone="dark" open={abierto} onClose={onCerrar} title={`Cerrar ${sprint.name}`} size="lg">
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-3">
          <Cifra etiqueta="Terminadas" valor={hechas} />
          <Cifra etiqueta="Sin terminar" valor={pendientes.length} aviso={pendientes.length > 0} />
        </dl>

        {pendientes.length > 0 && (
          <section className="flex flex-col gap-2" aria-label="Qué pasa con lo pendiente">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="font-sans text-sm font-semibold text-text-primary">
                Lo que no se terminó
              </h4>
              <button
                type="button"
                onClick={() =>
                  setABacklog(
                    alSiguiente ? new Set(pendientes.map((t) => t.id)) : new Set<string>(),
                  )
                }
                className="cursor-pointer font-sans text-xs text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
              >
                {alSiguiente ? 'Todas al backlog' : 'Todas al siguiente'}
              </button>
            </div>
            <ul className="flex max-h-72 flex-col overflow-y-auto rounded-xl border border-border">
              {pendientes.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-sans text-sm text-text-primary">{t.title}</span>
                    <span className="font-sans text-[11px] text-text-secondary">
                      {columnaDe(t.columnId)}
                    </span>
                  </span>
                  <fieldset className="m-0 flex shrink-0 rounded-lg border border-border p-0.5">
                    <legend className="sr-only">Destino de «{t.title}»</legend>
                    <Opcion activa={decision(t.id) === 'nextSprint'} onClick={() => alternar(t.id)}>
                      Siguiente
                    </Opcion>
                    <Opcion activa={decision(t.id) === 'backlog'} onClick={() => alternar(t.id)}>
                      Backlog
                    </Opcion>
                  </fieldset>
                </li>
              ))}
            </ul>
            {alSiguiente &&
              (planeado ? (
                <p className="font-sans text-xs text-text-secondary">
                  Pasan a <span className="text-text-primary">{planeado.name}</span>, en la columna
                  en la que estaban.
                </p>
              ) : (
                <FloatingLabelInput
                  id="sprint-siguiente"
                  label="Siguiente sprint"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  maxLength={100}
                />
              ))}
          </section>
        )}

        {estado.error && (
          <p role="alert" className="font-sans text-xs text-error">
            {estado.error}
          </p>
        )}

        {enviando && (
          <output className="block font-sans text-xs text-text-secondary">
            Cerrando el sprint…
          </output>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={enviar} isLoading={enviando}>
            Cerrar sprint
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Cifra({ etiqueta, valor, aviso }: { etiqueta: string; valor: number; aviso?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border px-4 py-3">
      <dt className="font-sans text-xs text-text-secondary">{etiqueta}</dt>
      <dd
        className={`font-sans text-3xl font-semibold tabular-nums ${aviso ? 'text-warning' : 'text-text-primary'}`}
      >
        {valor}
      </dd>
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
      className={`cursor-pointer rounded-md px-2.5 py-1 font-sans text-xs transition-colors ${
        activa ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Descartar ─────────────────────────────────────────────────────────── */

export function DescartarSprintDialog({
  abierto,
  onCerrar,
  board,
  projectId,
  sprint,
  tareas,
}: {
  abierto: boolean;
  onCerrar: () => void;
  board: Board;
  projectId: string;
  sprint: Sprint;
  tareas: number;
}) {
  const [estado, descartar, enviando] = useAccion(discardSprintAction, SPRINT_INITIAL_STATE);
  useAlConfirmar(estado.done, onCerrar);

  return (
    <Dialog
      tone="dark"
      open={abierto}
      onClose={onCerrar}
      title={`Descartar ${sprint.name}`}
      size="sm"
    >
      <p className="font-sans text-sm text-text-secondary">
        {tareas === 0
          ? 'No tiene tareas.'
          : `Sus ${tareas} ${tareas === 1 ? 'tarea vuelve' : 'tareas vuelven'} al backlog.`}
      </p>
      {estado.error && (
        <p role="alert" className="mt-3 font-sans text-xs text-error">
          {estado.error}
        </p>
      )}
      {enviando && (
        <output className="block mt-3 font-sans text-xs text-text-secondary">
          Descartando el sprint…
        </output>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="danger"
          isLoading={enviando}
          onClick={() => {
            if (enviando) return;
            const datos = new FormData();
            datos.set('projectId', projectId);
            datos.set('boardId', board.id);
            datos.set('sprintId', sprint.id);
            descartar(datos);
          }}
        >
          Descartar
        </Button>
      </div>
    </Dialog>
  );
}
