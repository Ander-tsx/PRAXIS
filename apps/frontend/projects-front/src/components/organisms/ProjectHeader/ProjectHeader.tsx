import { Badge, type ProjectDetail } from '@praxis/commons';
import Link from 'next/link';
import { DeleteProjectButton } from './DeleteProjectButton';
import { EditableProjectFields } from './EditableProjectFields';

export interface ProjectHeaderProps {
  project: ProjectDetail;
  isOwner: boolean;
  memberCount: number;
  boardCount: number;
  columnCount: number;
  labelCount: number;
  /**
   * Se lee de `GET /projects/:id/permissions/me`, no se deduce de `isOwner`: el
   * dueño lo tiene por bypass, pero un rol con `canDeleteProject` también, y
   * probar y comerse un 403 no es forma de decidir qué se enseña.
   */
  canDelete: boolean;
  /**
   * `canEditProject`. Sin él la cabecera es texto plano, con su `<h2>` y su
   * párrafo: quien solo mira no debe encontrarse campos, ni siquiera
   * desactivados.
   */
  canEdit: boolean;
  /**
   * La cabecera en una sola línea.
   *
   * Lo pide la pestaña del tablero, que ya no desplaza la página: allí el alto
   * es un recurso escaso y la cabecera completa —volver, título a `text-4xl`,
   * descripción en serif y el pie de metadatos— gastaba cuatro filas para decir
   * cosas que solo se leen al llegar. En compacto queda lo que sigue haciendo
   * falta mientras se trabaja: volver, el nombre, de quién es y el borrado.
   *
   * ⚠️ **La fecha de creación y los recuentos no salen en compacto**, y es a
   * propósito: son contexto de aterrizaje, no de trabajo, y los mismos números
   * están en los contadores de las pestañas y en el diálogo de borrado.
   */
  compacto?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function ProjectHeader({
  project,
  isOwner,
  memberCount,
  boardCount,
  columnCount,
  labelCount,
  canDelete,
  canEdit,
  compacto = false,
}: ProjectHeaderProps) {
  if (compacto) {
    return (
      <header className="flex min-w-0 shrink-0 items-center gap-3">
        <Link
          href="/"
          aria-label="Volver a todos los proyectos"
          title="Todos los proyectos"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        {canEdit ? (
          <EditableProjectFields
            compacto
            key={project.id}
            projectId={project.id}
            initialName={project.name}
            initialDescription={project.description ?? ''}
            badgeSlot={
              <Badge variant={isOwner ? 'accent' : 'info'}>{isOwner ? 'DUEÑO' : 'MIEMBRO'}</Badge>
            }
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <h2 className="truncate font-display text-xl text-text-primary">{project.name}</h2>
            <Badge variant={isOwner ? 'accent' : 'info'}>{isOwner ? 'DUEÑO' : 'MIEMBRO'}</Badge>
            {project.description && (
              <p
                title={project.description}
                className="min-w-0 flex-1 truncate font-serif text-sm italic text-text-secondary"
              >
                {project.description}
              </p>
            )}
          </div>
        )}

        {canDelete && (
          <DeleteProjectButton
            projectId={project.id}
            projectName={project.name}
            workspaceCount={project.workspaces.length}
            boardCount={boardCount}
            columnCount={columnCount}
            labelCount={labelCount}
            memberCount={memberCount}
            roleCount={project.roles.length}
          />
        )}
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-4">
      {/* Volver y eliminar comparten fila: son las dos acciones sobre el
          proyecto entero, y ninguna pertenece al título. */}
      <div className="flex items-center justify-between gap-4">
        {/* `/` es la lista: dentro de la zona se escribe sin el basePath. */}
        <Link
          href="/"
          className="w-fit font-sans text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          ← Todos los proyectos
        </Link>

        {canDelete && (
          <DeleteProjectButton
            projectId={project.id}
            projectName={project.name}
            workspaceCount={project.workspaces.length}
            boardCount={boardCount}
            columnCount={columnCount}
            labelCount={labelCount}
            memberCount={memberCount}
            roleCount={project.roles.length}
          />
        )}
      </div>

      {canEdit ? (
        /**
         * Con permiso, el nombre y la descripción **son** los campos: parecen
         * texto y se guardan solos. La insignia se queda dentro para que siga
         * en la misma línea que el título.
         *
         * Se le pasa `key={project.id}`: sin ella, navegar de un proyecto a
         * otro reutilizaría el componente y su estado inicial —el texto de
         * antes— porque el valor de las props no vuelve a leerse a propósito.
         */
        <EditableProjectFields
          key={project.id}
          projectId={project.id}
          initialName={project.name}
          initialDescription={project.description ?? ''}
          badgeSlot={
            <Badge variant={isOwner ? 'accent' : 'info'}>{isOwner ? 'DUEÑO' : 'MIEMBRO'}</Badge>
          }
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-x-4 gap-y-2">
            <h2 className="font-display text-3xl text-text-primary sm:text-4xl">{project.name}</h2>
            <Badge variant={isOwner ? 'accent' : 'info'}>{isOwner ? 'DUEÑO' : 'MIEMBRO'}</Badge>
          </div>

          {project.description ? (
            <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
              {project.description}
            </p>
          ) : (
            <p className="font-serif text-lg italic text-text-disabled">Sin descripción</p>
          )}
        </>
      )}

      {/* Los contadores de espacios, equipo y roles los llevan las pestañas;
          aquí solo va lo que no aparece allí. */}
      <p className="font-sans text-sm text-text-disabled">
        Creado el {dateFormatter.format(new Date(project.createdAt))} · {boardCount}{' '}
        {boardCount === 1 ? 'tablero' : 'tableros'} · {memberCount}{' '}
        {memberCount === 1 ? 'persona' : 'personas'}
      </p>
    </header>
  );
}
