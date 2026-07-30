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
}: ProjectHeaderProps) {
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
