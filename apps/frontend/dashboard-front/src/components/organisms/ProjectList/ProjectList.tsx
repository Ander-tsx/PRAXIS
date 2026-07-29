import { Badge, type Project, alpha, colors } from '@praxis/commons';

export interface ProjectListProps {
  projects: Project[];
  /** Para distinguir los proyectos propios de aquellos donde solo es miembro. */
  currentUserId: string;
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function Count({ value, singular, plural }: { value: number; singular: string; plural: string }) {
  return (
    <span className="font-sans text-xs text-text-secondary">
      <span className="font-semibold text-text-primary">{value}</span>{' '}
      {value === 1 ? singular : plural}
    </span>
  );
}

/**
 * Rejilla de proyectos.
 *
 * Recibe la lista ya filtrada: quién puede verlos lo decide la page, no este
 * componente.
 */
export function ProjectList({ projects, currentUserId }: ProjectListProps) {
  return (
    <section className="flex flex-col gap-4" aria-label="Mis proyectos">
      <h3 className="font-display text-2xl text-text-primary">Mis proyectos</h3>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-sans text-base font-semibold text-text-primary">
                  {project.name}
                </h4>

                {/* Desde que la lista incluye proyectos ajenos, conviene decir
                    cuáles no son tuyos. */}
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
                {formatDate(project.createdAt)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
