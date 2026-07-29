import { type Workspace, alpha, colors } from '@praxis/commons';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';

export interface ProjectWorkspacesProps {
  projectId: string;
  workspaces: Workspace[];
  canCreate: boolean;
}

/**
 * Espacios de trabajo del proyecto.
 *
 * Los tableros cuelgan de aquí, pero la pantalla de tableros todavía no
 * existe, así que las tarjetas no navegan a ninguna parte: enseñarlas como
 * enlaces prometería algo que no hay.
 */
export function ProjectWorkspaces({ projectId, workspaces, canCreate }: ProjectWorkspacesProps) {
  return (
    <section className="flex flex-col gap-4" aria-label="Espacios de trabajo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-2xl text-text-primary">Espacios de trabajo</h3>
          <p className="font-sans text-sm text-text-secondary">
            Agrupan los tableros del proyecto.
          </p>
        </div>

        {canCreate && <CreateWorkspaceDialog projectId={projectId} />}
      </div>

      {workspaces.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-6 font-sans text-sm text-text-secondary">
          Todavía no hay espacios.{' '}
          {canCreate
            ? 'Crea el primero para empezar a organizar el trabajo.'
            : 'Quien administre el proyecto puede crear el primero.'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((workspace) => (
            <li
              key={workspace.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ background: alpha(colors.accent, 12), color: colors.accent }}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </span>

              <div className="flex min-w-0 flex-col">
                <span className="truncate font-sans text-sm font-semibold text-text-primary">
                  {workspace.name}
                </span>
                <span className="font-sans text-xs text-text-disabled">Tableros: pronto</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
