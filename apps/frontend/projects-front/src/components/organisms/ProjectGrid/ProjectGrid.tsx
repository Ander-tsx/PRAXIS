import { Badge, type Project, alpha, colors,
  projectPath,
} from '@praxis/commons';
import Link from 'next/link';
import { ProjectSearch } from '../ProjectSearch';

export interface ProjectGridProps {
  projects: Project[];
  total: number;
  currentUserId: string;
  search: string;
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function Count({ value, singular, plural }: { value: number; singular: string; plural: string }) {
  return (
    <span className="font-sans text-xs text-text-secondary">
      <span className="font-semibold text-text-primary">{value}</span>{' '}
      {value === 1 ? singular : plural}
    </span>
  );
}

export function ProjectGrid({ projects, total, currentUserId, search }: ProjectGridProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProjectSearch initialValue={search} />
        <span className="font-sans text-sm text-text-secondary">
          {total} {total === 1 ? 'proyecto' : 'proyectos'}
        </span>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-8 text-center font-sans text-sm text-text-secondary">
          Ningún proyecto coincide con «{search}».
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              {/* Misma zona → next/link, sin el basePath: Next añade /projects. */}
              <Link
                href={projectPath(project)}
                className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-sans text-base font-semibold text-text-primary">
                      {project.name}
                    </h3>
                    {project.ownerId !== currentUserId && (
                      <Badge variant="info" className="shrink-0">
                        MIEMBRO
                      </Badge>
                    )}
                  </div>

                  {project.description ? (
                    <p className="line-clamp-2 font-sans text-sm text-text-secondary">
                      {project.description}
                    </p>
                  ) : (
                    <p className="font-sans text-sm italic text-text-disabled">Sin descripción</p>
                  )}
                </div>

                <div
                  className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3"
                  style={{ borderColor: alpha(colors.border, 70) }}
                >
                  <Count value={project._count.members} singular="miembro" plural="miembros" />
                  <Count value={project._count.workspaces} singular="espacio" plural="espacios" />
                  <span className="ml-auto font-sans text-xs text-text-disabled">
                    {dateFormatter.format(new Date(project.createdAt))}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
