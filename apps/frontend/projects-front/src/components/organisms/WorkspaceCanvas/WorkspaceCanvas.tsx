import { type Workspace, alpha, colors } from '@praxis/commons';
import { CreateBoardButton } from './CreateBoardButton';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';

export interface WorkspaceCanvasProps {
  projectId: string;
  workspaces: Workspace[];
  canManage: boolean;
}

/**
 * Espacios de trabajo como lienzo.
 *
 * La jerarquía real es **proyecto → espacio → tablero → columna → tarea**, y
 * una lista plana de espacios no la deja ver: hay que entrar en cada uno para
 * saber qué contiene. Aquí cada espacio es una columna del lienzo con sus
 * tableros dentro, así que la estructura entera se lee de un vistazo y se
 * añade en el sitio.
 *
 * Todo sale de `GET /projects/:id`, que ya trae espacios → tableros → columnas
 * embebidos: el lienzo no cuesta ninguna petición extra.
 *
 * El lienzo desplaza en horizontal; cada columna desplaza en vertical por su
 * cuenta. La página nunca desborda a lo ancho.
 */
export function WorkspaceCanvas({ projectId, workspaces, canManage }: WorkspaceCanvasProps) {
  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: alpha(colors.accent, 12), color: colors.accent }}
        >
          <svg
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </span>

        <div className="flex flex-col gap-2">
          <h3 className="font-display text-2xl text-text-primary">El lienzo está vacío</h3>
          <p className="max-w-md font-sans text-sm text-text-secondary">
            Un espacio agrupa tableros: uno por equipo, por fase o por lo que le convenga a este
            proyecto. Dentro de cada tablero irán las columnas y las tareas.
          </p>
        </div>

        {canManage ? (
          <CreateWorkspaceDialog projectId={projectId} triggerSize="lg" />
        ) : (
          <p className="font-sans text-sm text-text-disabled">
            Quien administre el proyecto puede crear el primero.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {workspaces.map((workspace) => (
        <section
          key={workspace.id}
          aria-label={`Espacio ${workspace.name}`}
          className="flex max-h-[65vh] w-72 shrink-0 flex-col rounded-2xl border border-border bg-surface"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="truncate font-sans text-sm font-semibold text-text-primary">
              {workspace.name}
            </h3>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 font-sans text-[11px] tabular-nums text-text-secondary"
              style={{ background: alpha(colors.border, 60) }}
            >
              {workspace.boards.length}
            </span>
          </header>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {workspace.boards.length === 0 ? (
              <p className="px-1 py-3 font-sans text-xs text-text-disabled">
                Sin tableros todavía.
              </p>
            ) : (
              workspace.boards.map((board) => (
                <article
                  key={board.id}
                  className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2.5"
                >
                  <span className="truncate font-sans text-sm text-text-primary">
                    {board.name}
                  </span>
                  <span className="font-sans text-xs text-text-disabled">
                    {board.columns.length === 0
                      ? 'Sin columnas'
                      : `${board.columns.length} ${board.columns.length === 1 ? 'columna' : 'columnas'}`}
                  </span>
                </article>
              ))
            )}
          </div>

          {canManage && (
            <div className="border-t border-border p-3">
              <CreateBoardButton workspaceId={workspace.id} projectId={projectId} />
            </div>
          )}
        </section>
      ))}

      {/* Columna final: añadir otro espacio sin salir del lienzo. */}
      {canManage && (
        <div className="flex w-72 shrink-0 items-start">
          <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-6">
            <p className="text-center font-sans text-xs text-text-disabled">
              Agrupa tableros por equipo o por fase.
            </p>
            <CreateWorkspaceDialog projectId={projectId} />
          </div>
        </div>
      )}
    </div>
  );
}
