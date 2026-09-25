'use client';

import { createPlannedSprintAction } from '@/app/(privado)/projects/[id]/sprint-actions';
import { SPRINT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  type Board,
  Button,
  type Sprint,
  type SprintMetrics,
  type Task,
  type UserProfile,
  colors,
  useAccion,
} from '@praxis/commons';
import { type ReactNode, useCallback, useState } from 'react';
import { CerrarSprintDialog, DescartarSprintDialog, FormularioDeSprint } from './SprintDialogs';
import { SprintPanel } from './SprintPanel';
import { type Unidad, conUnidad, valor } from './burndown';
import { diasRestantes, sprintsPlaneados, textoDiasRestantes } from './scrum';

/** Qué panel lateral del tablero está abierto. Solo uno a la vez (D21). */
export type PanelDelTablero = 'backlog' | 'sprint' | null;

type Dialogo = 'empezar' | 'cerrar' | 'descartar' | null;

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
  usersById: Map<string, UserProfile>;
  /** El panel abierto y cómo cambiarlo: lo decide el tablero, que tiene los dos. */
  panel: PanelDelTablero;
  onPanel: (panel: PanelDelTablero) => void;
  canManageSprint: boolean;
}

/**
 * La franja del sprint, encima del tablero de un tablero Scrum (D18 y D21 de
 * `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * Dos botones iguales, uno al lado del otro: **Sprint** y **Backlog**. Cada
 * uno abre su panel lateral, y solo puede haber uno abierto; si encima se abre
 * una tarea, el panel se esconde hasta volver a él (lo hace `SlideOver`). Antes el sprint tenía su propio `⋯`, y a un palmo
 * del `⋯` del tablero eran dos menús idénticos para cosas distintas.
 *
 * La única acción que sale fuera del panel es la que toca hacer: «Empezar
 * sprint» con uno planeado, y «Cerrar sprint» cuando se acabó el tiempo o
 * está todo hecho.
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
  usersById,
  panel,
  onPanel,
  canManageSprint,
}: SprintStripProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const cerrarDialogo = useCallback(() => setDialogo(null), []);
  const cerrarPanel = useCallback(() => onPanel(null), [onPanel]);
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

  const alternar = (p: Exclude<PanelDelTablero, null>) => onPanel(panel === p ? null : p);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3">
      {enTablero ? (
        <BotonDePanel
          activo={panel === 'sprint'}
          onClick={() => alternar('sprint')}
          etiqueta={`Sprint: ${enTablero.name}`}
          punto={!enCurso ? 'vacio' : vencido ? 'aviso' : 'lleno'}
        >
          <span className="max-w-[12rem] truncate font-semibold">{enTablero.name}</span>
          <span className={`hidden sm:inline ${vencido ? 'text-warning' : 'text-text-secondary'}`}>
            {enCurso ? textoDiasRestantes(dias) : 'sin empezar'}
          </span>
        </BotonDePanel>
      ) : (
        <span className="font-sans text-sm text-text-secondary">Sin sprint</span>
      )}

      {enTablero?.goal && (
        <span
          className="hidden min-w-0 max-w-md flex-1 truncate font-sans text-xs text-text-secondary md:block"
          title={enTablero.goal}
        >
          {enTablero.goal}
        </span>
      )}

      <span className="ml-auto flex items-center gap-2">
        {enTablero &&
          (enCurso ? (
            <span
              className="hidden items-center gap-2 font-sans text-xs text-text-secondary sm:flex"
              title={`${porcentaje}% hecho`}
            >
              <span
                className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.08]"
                aria-hidden="true"
              >
                <span
                  className="block h-full rounded-full bg-primary transition-all"
                  style={{ width: `${porcentaje}%` }}
                />
              </span>
              <span className="tabular-nums">
                {hecho}/{conUnidad(total, unidad)}
              </span>
            </span>
          ) : (
            <span className="hidden font-sans text-xs tabular-nums text-text-secondary sm:inline">
              {unidad === 'puntos' ? conUnidad(total, unidad) : conUnidad(tareas.length, 'tareas')}
              {velocidadMedia !== null && ` de ~${conUnidad(velocidadMedia, unidad)}`}
            </span>
          ))}
        <BotonDePanel
          activo={panel === 'backlog'}
          onClick={() => alternar('backlog')}
          etiqueta={`Backlog, ${enBacklog} ${enBacklog === 1 ? 'tarea' : 'tareas'}`}
          icono={<path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />}
        >
          Backlog
          <span className="tabular-nums text-text-secondary">{enBacklog}</span>
        </BotonDePanel>
        {canManageSprint && !enTablero && (
          <Button size="sm" onClick={planearNuevo} isLoading={planeando}>
            Planear sprint
          </Button>
        )}
        {canManageSprint && enTablero && !enCurso && (
          <Button size="sm" onClick={() => setDialogo('empezar')}>
            Empezar sprint
          </Button>
        )}
        {canManageSprint && tocaCerrar && (
          <Button size="sm" onClick={() => setDialogo('cerrar')}>
            Cerrar sprint
          </Button>
        )}
      </span>

      {estadoPlan.error && (
        <p role="alert" className="w-full font-sans text-xs text-error">
          {estadoPlan.error}
        </p>
      )}

      {enTablero && (
        <SprintPanel
          abierto={panel === 'sprint'}
          onCerrar={cerrarPanel}
          board={board}
          projectId={projectId}
          sprint={enTablero}
          sprints={sprints}
          tareas={tareas}
          metricas={metricas}
          unidad={unidad}
          usersById={usersById}
          canManageSprint={canManageSprint}
          onEmpezar={() => setDialogo('empezar')}
          onCerrarSprint={() => setDialogo('cerrar')}
          onDescartar={() => setDialogo('descartar')}
        />
      )}

      {enTablero && dialogo === 'empezar' && (
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
      {enTablero && dialogo === 'cerrar' && (
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
      {enTablero && dialogo === 'descartar' && (
        <DescartarSprintDialog
          abierto
          onCerrar={cerrarDialogo}
          board={board}
          projectId={projectId}
          sprint={enTablero}
          tareas={tareas.length}
        />
      )}
    </div>
  );
}

/**
 * Un botón que abre un panel lateral. Sprint y Backlog son iguales a propósito:
 * hacen lo mismo —abrir su panel— y se leen como pareja.
 */
function BotonDePanel({
  activo,
  onClick,
  etiqueta,
  icono,
  punto,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  etiqueta: string;
  icono?: ReactNode;
  punto?: 'lleno' | 'vacio' | 'aviso';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      aria-label={etiqueta}
      className={`flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 font-sans text-xs font-medium transition-colors ${
        activo
          ? 'bg-primary/15 text-primary'
          : 'border border-border text-text-primary hover:border-border-strong'
      }`}
    >
      {punto && (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background:
              punto === 'vacio'
                ? 'transparent'
                : punto === 'aviso'
                  ? colors.warning
                  : colors.primary,
            boxShadow: punto === 'vacio' ? `inset 0 0 0 1.5px ${colors.textSecondary}` : undefined,
          }}
        />
      )}
      {icono && (
        <svg
          className="h-3.5 w-3.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          {icono}
        </svg>
      )}
      {children}
    </button>
  );
}
