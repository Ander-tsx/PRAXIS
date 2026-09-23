'use client';

import type { VistaTablero } from './VistaSelector';

/**
 * Lo que enseña el Kanban de un tablero Scrum sin sprint en curso (D12 de
 * `docs/PLAN-SCRUM-KANBAN.md`).
 *
 * Las columnas no se pintan vacías sin más: un tablero en blanco sin
 * explicación se lee como trabajo perdido. Se dice por qué está vacío y
 * adónde ir.
 */
export function SinSprintActivo({
  planeados,
  enBacklog,
  onIr,
  onBacklog,
}: {
  planeados: number;
  enBacklog: number;
  onIr: (vista: VistaTablero) => void;
  onBacklog: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h3 className="font-display text-2xl text-text-primary">No hay sprint en curso</h3>
      <p className="max-w-md font-sans text-sm text-text-secondary">
        Este tablero trabaja por sprints: el Kanban enseña solo lo comprometido en el sprint activo.{' '}
        {enBacklog > 0 && `Hay ${enBacklog} ${enBacklog === 1 ? 'tarea' : 'tareas'} en el backlog`}
        {enBacklog > 0 && planeados > 0 && ' y '}
        {planeados > 0 &&
          `${planeados} ${planeados === 1 ? 'sprint planeado' : 'sprints planeados'} esperando`}
        {(enBacklog > 0 || planeados > 0) && '.'}
      </p>
      <div className="flex items-center gap-4 font-sans text-sm">
        <button
          type="button"
          onClick={onBacklog}
          className="cursor-pointer text-text-primary underline decoration-dotted underline-offset-4"
        >
          Abrir el backlog
        </button>
        <button
          type="button"
          onClick={() => onIr('sprint')}
          className="cursor-pointer text-primary underline decoration-dotted underline-offset-4"
        >
          {planeados > 0 ? 'Iniciar un sprint' : 'Planear un sprint'}
        </button>
      </div>
    </div>
  );
}
