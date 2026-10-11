'use client';

import {
  type Board,
  Dialog,
  PRIORITY_LABELS,
  type Paginated,
  type Sprint,
  type Task,
  type UserProfile,
  createApiClient,
  displayName,
} from '@praxis/commons';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { DescripcionMarkdown } from '../TaskBoard/DescripcionMarkdown';
import { rangoDeFechas } from './scrum';

const api = createApiClient({ gatewayPath: '/api/gateway' });

/** Un sprint cerrado no pasa de unos cientos de tareas; el tope del gateway es 1000. */
const LIMITE = 1000;

/** «12 oct 2026»: la misma forma abreviada de los selectores de fecha. */
function diaCorto(iso: string): string {
  const d = new Date(iso);
  const mes = d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return `${d.getDate()} ${mes} ${d.getFullYear()}`;
}

/**
 * Las tareas de un sprint **cerrado**, de solo lectura.
 *
 * Al cerrar, lo terminado se queda en el sprint y desaparece del tablero (D6 de
 * `docs/PLAN-SCRUM-KANBAN.md`), y ni el Kanban, ni la Tabla ni el Calendario cargan
 * sprints cerrados: sin esto solo quedaba el resumen del cierre, sin una sola tarea.
 *
 * Se piden **al abrir**, no con la página: un tablero con meses de historial no debe
 * cargarlas todas en cada visita. `sprintId` es el mismo filtro que usa el Kanban.
 */
export function TareasDeSprint({
  sprint,
  board,
  usersById,
  onCerrar,
}: {
  /** El sprint a mostrar, o `null` con el diálogo cerrado. */
  sprint: Sprint | null;
  board: Board;
  /** Para nombrar a los encargados. Sin él, solo se cuenta cuántos eran. */
  usersById?: Map<string, UserProfile>;
  onCerrar: () => void;
}) {
  const [tareas, setTareas] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  /** Una sola desplegada a la vez. */
  const [abierta, setAbierta] = useState<string | null>(null);
  const id = sprint?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    setTareas(null);
    setError(false);
    setAbierta(null);
    api
      .get<Paginated<Task>>(`/boards/${board.id}/tasks?sprintId=${id}&limit=${LIMITE}`)
      .then((page) => {
        if (vigente) setTareas(page.items);
      })
      .catch(() => {
        if (vigente) setError(true);
      });
    return () => {
      vigente = false;
    };
  }, [id, board.id]);

  const columnas = useMemo(() => new Map(board.columns.map((c) => [c.id, c.name])), [board]);
  const hechas = tareas?.filter((t) => t.completedAt) ?? [];
  const otras = tareas?.filter((t) => !t.completedAt) ?? [];

  return (
    <Dialog
      tone="dark"
      open={sprint !== null}
      onClose={onCerrar}
      title={sprint ? `Tareas de ${sprint.name}` : 'Tareas del sprint'}
      description={sprint ? rangoDeFechas(sprint) : undefined}
      size="lg"
    >
      {error ? (
        <p role="alert" className="font-sans text-sm text-error">
          No se pudieron cargar las tareas de este sprint.
        </p>
      ) : tareas === null ? (
        <p className="font-sans text-sm text-text-secondary">Cargando…</p>
      ) : tareas.length === 0 ? (
        <p className="font-sans text-sm text-text-secondary">
          Este sprint no conserva tareas: las que no se terminaron pasaron al siguiente o al
          backlog.
        </p>
      ) : (
        <div className="scrollbar-none flex max-h-[60vh] flex-col gap-5 overflow-y-auto">
          <Grupo
            titulo="Terminadas"
            tareas={hechas}
            columnas={columnas}
            usersById={usersById}
            abierta={abierta}
            onAbrir={setAbierta}
          />
          <Grupo
            titulo="Sin terminar"
            tareas={otras}
            columnas={columnas}
            usersById={usersById}
            abierta={abierta}
            onAbrir={setAbierta}
          />
        </div>
      )}
    </Dialog>
  );
}

function Grupo({
  titulo,
  tareas,
  columnas,
  usersById,
  abierta,
  onAbrir,
}: {
  titulo: string;
  tareas: Task[];
  columnas: Map<string, string>;
  usersById?: Map<string, UserProfile>;
  abierta: string | null;
  onAbrir: (id: string | null) => void;
}) {
  if (tareas.length === 0) return null;
  return (
    <section className="flex flex-col">
      <h4 className="font-sans text-xs uppercase tracking-wide text-text-secondary">
        {titulo} <span className="tabular-nums">· {tareas.length}</span>
      </h4>
      <ul className="flex flex-col">
        {tareas.map((t) => {
          const desplegada = abierta === t.id;
          return (
            <li key={t.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                aria-expanded={desplegada}
                onClick={() => onAbrir(desplegada ? null : t.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] ${
                  desplegada ? 'bg-white/[0.06]' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
                  {t.title}
                </span>
                <span className="shrink-0 font-sans text-xs tabular-nums text-text-secondary">
                  {[columnas.get(t.columnId), t.completedAt && diaCorto(t.completedAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${
                    desplegada ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
              {desplegada && <Detalle tarea={t} columnas={columnas} usersById={usersById} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Lo que la tarea tenía al cerrarse el sprint, todo dentro del mismo diálogo. */
function Detalle({
  tarea,
  columnas,
  usersById,
}: {
  tarea: Task;
  columnas: Map<string, string>;
  usersById?: Map<string, UserProfile>;
}) {
  const encargados = tarea.assignees.map((a) => {
    const usuario = usersById?.get(a.userId);
    return usuario ? displayName(usuario) : null;
  });
  const hechos = tarea.checklists.filter((c) => c.completed).length;
  const filas: [string, string | null][] = [
    ['Columna', columnas.get(tarea.columnId) ?? null],
    ['Prioridad', PRIORITY_LABELS[tarea.priority]],
    ['Puntos', tarea.estimatePoints !== null ? String(tarea.estimatePoints) : null],
    ['Fecha límite', tarea.dueDate ? diaCorto(tarea.dueDate) : null],
    ['Terminada', tarea.completedAt ? diaCorto(tarea.completedAt) : null],
    [
      'Encargados',
      tarea.assignees.length === 0
        ? null
        : encargados.every(Boolean)
          ? encargados.join(', ')
          : `${tarea.assignees.length}`,
    ],
  ];

  return (
    /* El interior de la tarea: un bloque aparte, sangrado y con borde de acento, para que se
       lea de un vistazo qué es de la tarea y qué es la lista que la contiene. */
    <div className="mb-3 ml-5 mt-1 flex flex-col gap-4 rounded-xl border border-l-2 border-white/10 border-l-primary/70 bg-black/25 p-4">
      <p className="whitespace-pre-wrap break-words font-sans text-[15px] font-semibold leading-snug text-text-primary">
        {tarea.title}
      </p>

      <SeccionDeDetalle titulo="Descripción">
        {/* Se escribe en Markdown: se enseña con el mismo visor de solo lectura que el panel de
            la tarea, no como texto con asteriscos. */}
        {tarea.description ? (
          <DescripcionMarkdown key={tarea.id} initial={tarea.description} readOnly />
        ) : (
          <p className="font-sans text-xs italic text-text-secondary">Sin descripción.</p>
        )}
      </SeccionDeDetalle>

      <SeccionDeDetalle titulo="Datos">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 font-sans text-xs">
          {filas
            .filter(([, valor]) => valor)
            .map(([clave, valor]) => (
              <div key={clave} className="contents">
                <dt className="text-text-secondary">{clave}</dt>
                <dd className="text-text-primary">{valor}</dd>
              </div>
            ))}
        </dl>
      </SeccionDeDetalle>

      {tarea.checklists.length > 0 && (
        <SeccionDeDetalle titulo={`Checklist · ${hechos}/${tarea.checklists.length}`}>
          <ul className="flex flex-col gap-1">
            {tarea.checklists.map((c) => (
              <li
                key={c.id}
                className={`whitespace-pre-wrap break-words font-sans text-xs ${
                  c.completed ? 'text-text-secondary line-through' : 'text-text-primary'
                }`}
              >
                {c.completed ? '✓' : '○'} {c.text}
              </li>
            ))}
          </ul>
        </SeccionDeDetalle>
      )}

      {tarea.comments.length > 0 && (
        <SeccionDeDetalle titulo="Notas">
          <span className="font-sans text-xs text-text-primary">
            {tarea.comments.length} {tarea.comments.length === 1 ? 'nota' : 'notas'}
          </span>
        </SeccionDeDetalle>
      )}
    </div>
  );
}

function SeccionDeDetalle({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h5 className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
        {titulo}
      </h5>
      {children}
    </section>
  );
}
