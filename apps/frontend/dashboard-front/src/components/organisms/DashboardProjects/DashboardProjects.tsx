import { type Project, ProjectCard, type UserProfile, projectHref } from '@praxis/commons';

export interface DashboardProjectsProps {
  projects: Project[];
  currentUserId: string;
  /**
   * Proyecto → las personas de su equipo, ya resueltas por la page.
   *
   * `null` en el valor significa «no se pudo pedir», que no es lo mismo que un
   * equipo vacío: con `null` la tarjeta vuelve al número de miembros.
   */
  equiposPorProyecto: Map<string, UserProfile[] | null>;
  /** Cuántos hay en total, que puede ser más de los que se pintan aquí. */
  total: number;
}

/**
 * Cuántos proyectos se enseñan en el panel antes de mandar a la rejilla entera.
 *
 * Seis son dos filas de tres en escritorio y tres filas de dos en tabla: llenan
 * el bloque sin empujar la bandeja de avisos fuera de la pantalla. Quien tenga
 * más los tiene todos a un clic, en la pantalla que existe para eso y que además
 * sabe buscar.
 */
const VISIBLES = 6;

/**
 * Tus proyectos, en el panel.
 *
 * ## Qué sustituye
 *
 * A `ProjectList`, que dibujaba su propia tarjeta: nombre, descripción y dos
 * contadores. Ahora usa `ProjectCard` de `commons` —la misma que la rejilla de
 * Proyectos— así que un proyecto tiene **una sola cara** en todo el producto: el
 * mismo monograma del mismo color, las mismas caras del equipo y el mismo aviso
 * de suspensión. Reconocerlo de un vistazo deja de depender de en qué pantalla
 * estés.
 *
 * ## Y deja de ser la lista completa
 *
 * `ProjectList` pintaba **todos** los proyectos que devolvía `GET /projects`.
 * Con quince, el panel se convertía en una rejilla de quince tarjetas y todo lo
 * demás quedaba debajo del pliegue. Aquí se enseñan {@link VISIBLES} y el resto
 * vive en Proyectos, que es la pantalla que además sabe buscar y paginar.
 */
export function DashboardProjects({
  projects,
  currentUserId,
  equiposPorProyecto,
  total,
}: DashboardProjectsProps) {
  const visibles = projects.slice(0, VISIBLES);
  const restantes = Math.max(0, total - visibles.length);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-proyectos">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="titulo-proyectos" className="font-display text-2xl text-text-primary">
          Tus proyectos
        </h2>

        {/* Cruza de zona → `<a>` duro. Con `next/link` sería
            `/dashboard/projects`, que es un 404. Ver §16. */}
        <a
          href="/projects"
          className="font-sans text-sm text-primary underline-offset-2 transition-colors hover:underline"
        >
          {restantes > 0 ? `Ver los ${total}` : 'Ver todos'}
        </a>
      </div>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            currentUserId={currentUserId}
            equipo={equiposPorProyecto.get(project.id) ?? null}
            /* Otra zona → la ruta completa del shell y `<a>` duro, que es lo
               que hace `sameZone` por defecto. */
            href={projectHref(project)}
            gatewayPath="/main/api/gateway"
          />
        ))}
      </ul>
    </section>
  );
}
