'use client';

import { createPlannedSprintAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  Button,
  type Sprint,
  type SprintMetrics,
  type Task,
  colors,
  useAccion,
} from '@praxis/commons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CerrarSprintDialog,
  DescartarSprintDialog,
  FormularioDeSprint,
  ProgresoDialog,
} from './SprintDialogs';
import { type Unidad, conUnidad, valor } from './burndown';
import { diasRestantes, rangoDeFechas, sprintsPlaneados, textoDiasRestantes } from './scrum';

type Dialogo = 'empezar' | 'editar' | 'cerrar' | 'descartar' | 'progreso' | null;

export interface SprintStripProps {
  board: Board;
  projectId: string;
  sprints: Sprint[];
  /** El sprint que enseña el tablero: en curso, o planeado, o ninguno. */
  enTablero: Sprint | null;
  /** Sus tareas: las del tablero. */
  tareas: Task[];
  metricas: SprintMetrics;
  unidad: Unidad;
  velocidadMedia: number | null;
  nombreSiguiente: string;
  enBacklog: number;
  backlogAbierto: boolean;
  onBacklog: () => void;
  canManageSprint: boolean;
}

/**
 * La franja del sprint, encima del tablero de un tablero Scrum (D15 y D18 de
 * `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * Es **todo el Scrum que se ve**: qué sprint es, su meta, cuánto queda, cómo
 * va, el backlog y las acciones. La vista «Sprint» tenía cuatro cosas y
 * obligaba a salir del tablero para verlas; aquí están a la vista y lo demás
 * —el burndown, el cierre— se abre encima sin perder el sitio.
 *
 * Tres estados, porque el tablero enseña siempre «el sprint de ahora»:
 *
 * - **En curso**: fechas, días que quedan y progreso. Cerrar va en el menú,
 *   salvo cuando ya toca (se acabó el tiempo o está todo hecho).
 * - **Planeado**: se está planificando; «Empezar sprint» es la acción.
 * - **Ninguno**: el tablero está vacío y se planea el primero arrastrando.
 */
export function SprintStrip({
  board,
  projectId,
  sprints,
  enTablero,
  tareas,
  metricas,
  unidad,
  velocidadMedia,
  nombreSiguiente,
  enBacklog,
  backlogAbierto,
  onBacklog,
  canManageSprint,
}: SprintStripProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const cerrarDialogo = useCallback(() => setDialogo(null), []);
  const [estadoPlan, planear, planeando] = useAccion(
    createPlannedSprintAction,
    SPRINT_INITIAL_STATE,
  );

  const enCurso = enTablero?.status === 'ACTIVE';
  const total = tareas.reduce((s, t) => s + valor(t, unidad), 0);
  const hecho = tareas.filter((t) => t.completedAt).reduce((s, t) => s + valor(t, unidad), 0);
  const porcentaje = total === 0 ? 0 : Math.round((hecho / total) * 100);
  const dias = enCurso && enTablero ? diasRestantes(enTablero) : null;
  const vencido = dias !== null && dias < 1;
  const tocaCerrar = enCurso && (vencido || (total > 0 && hecho === total));
  const planeado = sprintsPlaneados(sprints).find((s) => s.id !== enTablero?.id) ?? null;

  function planearNuevo() {
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('boardId', board.id);
    datos.set('name', nombreSiguiente);
    planear(datos);
  }

  const botonBacklog = (
    <button
      type="button"
      onClick={onBacklog}
      aria-pressed={backlogAbierto}
      aria-label={`Backlog, ${enBacklog} ${enBacklog === 1 ? 'tarea' : 'tareas'}`}
      className={`flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 font-sans text-xs font-medium transition-colors ${
        backlogAbierto
          ? 'bg-primary/15 text-primary'
          : 'border border-border text-text-primary hover:border-border-strong'
      }`}
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
      </svg>
      Backlog
      <span className="tabular-nums text-text-secondary">{enBacklog}</span>
    </button>
  );

  if (!enTablero) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border pb-3">
        <span className="font-sans text-sm text-text-secondary">Sin sprint</span>
        <span className="ml-auto flex items-center gap-2">
          {botonBacklog}
          {canManageSprint && (
            <Button size="sm" onClick={planearNuevo} isLoading={planeando}>
              Planear sprint
            </Button>
          )}
        </span>
        {estadoPlan.error && (
          <p role="alert" className="w-full font-sans text-xs text-error">
            {estadoPlan.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              background: !enCurso ? 'transparent' : vencido ? colors.warning : colors.primary,
              boxShadow: enCurso ? undefined : `inset 0 0 0 1.5px ${colors.textSecondary}`,
            }}
          />
          {/* El nombre no cede: es lo que dice qué sprint es. Ceden las fechas. */}
          <span className="max-w-[14rem] shrink-0 truncate font-sans text-sm font-semibold text-text-primary">
            {enTablero.name}
          </span>
          {enCurso ? (
            <span
              className={`min-w-0 truncate font-sans text-xs ${vencido ? 'text-warning' : 'text-text-secondary'}`}
            >
              <span className="hidden sm:inline">{rangoDeFechas(enTablero)} · </span>
              {textoDiasRestantes(dias)}
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-sans text-[11px] text-text-secondary">
              Sin empezar
            </span>
          )}
        </span>
        {enTablero.goal && (
          <span
            className="truncate pl-4 font-sans text-xs text-text-secondary"
            title={enTablero.goal}
          >
            {enTablero.goal}
          </span>
        )}
      </div>

      {enCurso ? (
        <button
          type="button"
          onClick={() => setDialogo('progreso')}
          title="Ver el progreso del sprint"
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
        >
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-border" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary transition-all"
              style={{ width: `${porcentaje}%` }}
            />
          </span>
          <span className="tabular-nums">
            {hecho}/{conUnidad(total, unidad)}
          </span>
        </button>
      ) : (
        <span className="font-sans text-xs tabular-nums text-text-secondary">
          {tareas.length} {tareas.length === 1 ? 'tarea' : 'tareas'}
          {unidad === 'puntos' && ` · ${conUnidad(total, unidad)}`}
          {velocidadMedia !== null &&
            ` · el equipo suele hacer ${conUnidad(velocidadMedia, unidad)}`}
        </span>
      )}

      <span className="flex items-center gap-2">
        {botonBacklog}
        {canManageSprint && !enCurso && (
          <Button size="sm" onClick={() => setDialogo('empezar')}>
            Empezar sprint
          </Button>
        )}
        {canManageSprint && tocaCerrar && (
          <Button size="sm" onClick={() => setDialogo('cerrar')}>
            Cerrar sprint
          </Button>
        )}
        {canManageSprint && (
          <MenuDelSprint
            opciones={[
              ...(enCurso
                ? [{ etiqueta: 'Progreso', alElegir: () => setDialogo('progreso') }]
                : []),
              { etiqueta: 'Editar sprint', alElegir: () => setDialogo('editar') },
              ...(enCurso && !tocaCerrar
                ? [{ etiqueta: 'Cerrar sprint', alElegir: () => setDialogo('cerrar') }]
                : []),
              ...(!enCurso
                ? [
                    {
                      etiqueta: 'Descartar sprint',
                      alElegir: () => setDialogo('descartar'),
                      peligro: true,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </span>

      {dialogo === 'empezar' && (
        <FormularioDeSprint
          modo="empezar"
          abierto
          onCerrar={cerrarDialogo}
          board={board}
          projectId={projectId}
          sprint={enTablero}
          tareas={tareas}
          unidad={unidad}
          velocidadMedia={velocidadMedia}
        />
      )}
      {dialogo === 'editar' && (
        <FormularioDeSprint
          modo="editar"
          abierto
          onCerrar={cerrarDialogo}
          board={board}
          projectId={projectId}
          sprint={enTablero}
          tareas={tareas}
          unidad={unidad}
          velocidadMedia={velocidadMedia}
        />
      )}
      {dialogo === 'cerrar' && (
        <CerrarSprintDialog
          abierto
          onCerrar={cerrarDialogo}
          board={board}
          projectId={projectId}
          sprint={enTablero}
          tareas={tareas}
          planeado={planeado}
          nombreSiguiente={nombreSiguiente}
        />
      )}
      {dialogo === 'descartar' && (
        <DescartarSprintDialog
          abierto
          onCerrar={cerrarDialogo}
          board={board}
          projectId={projectId}
          sprint={enTablero}
          tareas={tareas.length}
        />
      )}
      {dialogo === 'progreso' && (
        <ProgresoDialog
          abierto
          onCerrar={cerrarDialogo}
          sprint={enTablero}
          sprints={sprints}
          metricas={metricas}
          unidad={unidad}
        />
      )}
    </div>
  );
}

/** El `⋯` del sprint: lo que no se usa a diario. */
function MenuDelSprint({
  opciones,
}: {
  opciones: { etiqueta: string; alElegir: () => void; peligro?: boolean }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-label="Opciones del sprint"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 flex min-w-44 flex-col rounded-xl border border-border bg-surface p-1 shadow-2xl"
        >
          {opciones.map((o) => (
            <button
              key={o.etiqueta}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                o.alElegir();
              }}
              className={`cursor-pointer rounded-lg px-2.5 py-2 text-left font-sans text-xs transition-colors hover:bg-surface-elevated ${
                o.peligro ? 'text-error' : 'text-text-primary'
              }`}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
