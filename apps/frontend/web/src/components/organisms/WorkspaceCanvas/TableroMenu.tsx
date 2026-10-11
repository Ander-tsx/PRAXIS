'use client';

import { deleteBoardAction, updateBoardAction } from '@/app/(privado)/projects/[id]/actions';
import { EntityMenu } from '@/components/molecules/EntityMenu';
import { BOARD_INITIAL_STATE } from '@/lib/projects/action-state';
import { BOARD_NAME_MAX, validateBoard } from '@/lib/projects/validation';
import { useAccion } from '@praxis/commons';
import type { Board, Sprint } from '@praxis/commons';
import { HistorialDeSprints } from './HistorialDeSprints';
import { ScrumToggle } from './ScrumToggle';

export interface TableroMenuProps {
  projectId: string;
  board: Board;
  /** `canEditBoard`. */
  canEdit: boolean;
  /** `canDeleteBoard`. */
  canDelete: boolean;
  /** Tareas abiertas en columnas: al encender Scrum se ofrece llevarlas al primer sprint. */
  tareasAbiertas?: string[];
  /** Con un sprint en marcha, Scrum no se apaga: primero se cierra (S8). */
  haySprintEnCurso?: boolean;
  /** Sprints cerrados de cuando el tablero tenía Scrum. */
  historial?: Sprint[];
}

/**
 * Renombrar y eliminar un tablero, desde su propia cabecera.
 *
 * ⚠️ **Eliminar un tablero no existía en la interfaz**, aunque el endpoint
 * estaba desde el principio: se podían crear tableros y la única forma de
 * quitar uno era borrar el espacio entero, que se lleva por delante los demás.
 * Esa desproporción es la que arregla esto.
 *
 * El borrado cascadea sobre las columnas dentro de projects-service y el
 * gateway purga después sus tareas, que viven en otro microservicio. Por eso,
 * con columnas dentro, hay que escribir el nombre.
 */
export function TableroMenu({
  projectId,
  board,
  canEdit,
  canDelete,
  tareasAbiertas = [],
  haySprintEnCurso = false,
  historial,
}: TableroMenuProps) {
  const [estadoRenombrar, renombrar, renombrando] = useAccion(
    updateBoardAction,
    BOARD_INITIAL_STATE,
  );
  const [estadoEliminar, eliminar, eliminando] = useAccion(deleteBoardAction, BOARD_INITIAL_STATE);

  const columnas = board.columns.length;

  return (
    <EntityMenu
      entidad="tablero"
      nombre={board.name}
      nombreMax={BOARD_NAME_MAX}
      validarNombre={validateBoard}
      canEdit={canEdit}
      canDelete={canDelete}
      /* Encender Scrum es editar el tablero: el `PATCH` pide `canEditBoard`. */
      extras={
        canEdit ? (
          <>
            <ScrumToggle
              projectId={projectId}
              board={board}
              tareasAbiertas={tareasAbiertas}
              haySprintEnCurso={haySprintEnCurso}
            />
            {historial && historial.length > 0 && (
              <HistorialDeSprints sprints={historial} board={board} />
            )}
          </>
        ) : undefined
      }
      exigeEscribirNombre={columnas > 0}
      avisoDeBorrado={
        columnas === 0
          ? 'Está vacío. Aun así, no se puede deshacer.'
          : `Se irán con él sus ${columnas === 1 ? 'única columna' : `${columnas} columnas`} y las tareas que haya dentro. No se puede deshacer.`
      }
      camposOcultos={
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="boardId" value={board.id} />
        </>
      }
      renombrar={{
        ejecutar: renombrar,
        error: estadoRenombrar.error,
        confirmado: estadoRenombrar.savedName,
        pendiente: renombrando,
      }}
      eliminar={{
        ejecutar: eliminar,
        error: estadoEliminar.error,
        confirmado: estadoEliminar.savedName,
        pendiente: eliminando,
      }}
    />
  );
}
