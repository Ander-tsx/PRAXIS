import { AppHeader, type Paginated, type Project } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import Link from 'next/link';

/**
 * Puerta de la sección: elegir de qué proyecto se quiere el reporte.
 *
 * **Los reportes son de un proyecto, no globales**, y eso no es una limitación
 * de la pantalla sino del modelo de permisos: no hay ningún permiso que se pueda
 * comprobar sobre «todos tus proyectos a la vez», que es exactamente el motivo
 * por el que `/me/tasks` y `/me/notifications` cuelgan de `/me`. Un agregado que
 * cruzara proyectos mezclaría equipos que no se conocen entre sí.
 */
export default async function ReportsIndexPage() {
  const api = createServerApiClient();

  const proyectos = await api
    .get<Paginated<Project>>('/projects?limit=100')
    .catch(() => ({ items: [] as Project[], total: 0 }));

  return (
    <AppHeader title="Reportes">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
            Cómo va el trabajo
          </h2>
          <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
            Elige un proyecto para ver su reparto, su flujo, cuánto tarda cada
            tarea y qué cabe esperar.
          </p>
        </div>

        {proyectos.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <p className="font-display text-lg text-text-primary">
              Todavía no estás en ningún proyecto
            </p>
            <p className="mt-1 font-sans text-sm text-text-secondary">
              Los reportes se calculan sobre el trabajo de un proyecto.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {proyectos.items.map((proyecto) => (
              <li key={proyecto.id}>
                {/* Misma zona: sin el basePath, Next añade `/reports`. */}
                <Link
                  href={`/${proyecto.id}`}
                  className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-elevated"
                >
                  <h3 className="font-display text-xl text-text-primary">{proyecto.name}</h3>
                  {proyecto.description ? (
                    <p className="line-clamp-2 font-sans text-sm text-text-secondary">
                      {proyecto.description}
                    </p>
                  ) : (
                    <p className="font-serif text-sm italic text-text-disabled">Sin descripción</p>
                  )}
                  <p className="mt-auto font-sans text-sm text-text-disabled">
                    <span className="font-semibold text-text-secondary tabular-nums">
                      {proyecto._count.workspaces}
                    </span>{' '}
                    {proyecto._count.workspaces === 1 ? 'espacio' : 'espacios'} ·{' '}
                    <span className="font-semibold text-text-secondary tabular-nums">
                      {proyecto._count.members}
                    </span>{' '}
                    {proyecto._count.members === 1 ? 'persona' : 'personas'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppHeader>
  );
}
