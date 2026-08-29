import { type ProjectDetail, ProjectMonogram } from '@praxis/commons';
import Link from 'next/link';
import { ProjectSettingsButton } from './ProjectSettingsButton';

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
   * `canEditProject`. Sin él ni con `canDelete`, no aparece el botón de
   * configuración: quien solo mira no tiene nada que tocar.
   */
  canEdit: boolean;
  /**
   * La cabecera en una sola línea.
   *
   * Lo pide la pestaña del tablero, que ya no desplaza la página: allí el alto
   * es un recurso escaso y la cabecera completa —volver, título grande,
   * descripción en serif y el pie de metadatos— gastaba cuatro filas para decir
   * cosas que solo se leen al llegar. En compacto queda lo que sigue haciendo
   * falta mientras se trabaja: volver, el nombre, de quién es y la configuración.
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

/**
 * ⚠️ **El nombre y la descripción ya no se editan aquí en línea.**
 *
 * Lo hacían (`EditableProjectFields`, con autosave). Al sumar icono y color a la
 * identidad del proyecto, y con el borrado viviendo ya en la cabecera, todo eso
 * se juntó en el **modal de configuración** (`ProjectSettingsButton`): «la
 * configuración del proyecto» es una cosa, no cuatro controles sueltos repartidos
 * por la cabecera. Aquí el título vuelve a ser texto.
 */
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
  /* La píldora «DUEÑO / MIEMBRO» se retiró: no aportaba —quien entra ya sabe si
     el proyecto es suyo, y para lo que importa (qué puede hacer) está el mapa de
     permisos—. `isOwner` sigue llegando por si otra parte de la cabecera lo
     necesita. */
  void isOwner;

  const settings = (
    <ProjectSettingsButton
      projectId={project.id}
      projectName={project.name}
      projectDescription={project.description ?? ''}
      projectIconKey={project.iconKey ?? null}
      projectColor={project.color ?? null}
      canEdit={canEdit}
      canDelete={canDelete}
      workspaceCount={project.workspaces.length}
      boardCount={boardCount}
      columnCount={columnCount}
      labelCount={labelCount}
      memberCount={memberCount}
      roleCount={project.roles.length}
      compacto={compacto}
    />
  );

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

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ProjectMonogram
            id={project.id}
            name={project.name}
            iconKey={project.iconKey ?? null}
            color={project.color ?? null}
          />
          <h2 className="truncate font-sans text-xl font-semibold text-white">{project.name}</h2>
          {project.description && (
            <p
              title={project.description}
              className="min-w-0 flex-1 truncate font-serif text-sm italic text-white/50"
            >
              {project.description}
            </p>
          )}
        </div>

        {settings}
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-4">
      {/* Volver y configuración comparten fila: son lo que actúa sobre el
          proyecto entero, y ninguna pertenece al título. */}
      <div className="flex items-center justify-between gap-4">
        {/* `/` es la lista: dentro de la zona se escribe sin el basePath. */}
        <Link
          href="/"
          className="w-fit font-sans text-sm text-white/60 transition-colors hover:text-white"
        >
          ← Todos los proyectos
        </Link>

        {settings}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-x-4 gap-y-2">
          <ProjectMonogram
            id={project.id}
            name={project.name}
            iconKey={project.iconKey ?? null}
            color={project.color ?? null}
            size="md"
          />
          <h2 className="font-sans text-3xl font-semibold text-white sm:text-4xl">{project.name}</h2>
        </div>

        {project.description ? (
          <p className="max-w-2xl font-serif text-lg italic text-white/55">{project.description}</p>
        ) : (
          <p className="font-serif text-lg italic text-white/30">Sin descripción</p>
        )}
      </div>

      {/* Los contadores de espacios, equipo y roles los llevan las pestañas;
          aquí solo va lo que no aparece allí. */}
      <p className="font-sans text-sm text-white/45">
        Creado el {dateFormatter.format(new Date(project.createdAt))} · {boardCount}{' '}
        {boardCount === 1 ? 'tablero' : 'tableros'} · {memberCount}{' '}
        {memberCount === 1 ? 'persona' : 'personas'}
      </p>
    </header>
  );
}
