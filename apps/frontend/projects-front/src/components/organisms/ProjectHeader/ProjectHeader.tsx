import { Badge, type ProjectDetail } from '@praxis/commons';
import Link from 'next/link';

export interface ProjectHeaderProps {
  project: ProjectDetail;
  isOwner: boolean;
  memberCount: number;
  boardCount: number;
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
}: ProjectHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      {/* `/` es la lista: dentro de la zona se escribe sin el basePath. */}
      <Link
        href="/"
        className="w-fit font-sans text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        ← Todos los proyectos
      </Link>

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
