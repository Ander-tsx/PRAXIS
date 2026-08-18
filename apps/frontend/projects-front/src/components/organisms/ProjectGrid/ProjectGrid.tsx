import { ProjectCard, type Project, type UserProfile, projectPath } from '@praxis/commons';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProjectSearch } from '../ProjectSearch';

export interface ProjectGridProps {
  projects: Project[];
  total: number;
  currentUserId: string;
  search: string;
  /**
   * Proyecto → las personas de su equipo, ya resueltas por la page.
   *
   * `null` en el valor significa «no se pudo pedir», que no es lo mismo que un
   * equipo vacío: con `null` la tarjeta vuelve al número de miembros.
   */
  equiposPorProyecto: Map<string, UserProfile[] | null>;
  /**
   * El disparador de «Nuevo proyecto» en su forma de tarjeta, para cerrar la
   * rejilla.
   *
   * Entra como slot porque el diálogo necesita las Server Actions de la zona y
   * quien las tiene es la page. Aquí solo se coloca.
   */
  crearSlot?: ReactNode;
}

/**
 * La rejilla de proyectos, con su barra de búsqueda.
 *
 * ## Lo que se quitó de encima
 *
 * La pantalla abría con «Proyectos» en la cabecera, **«Tus proyectos» en un
 * `h2` de 3xl justo debajo** y una frase en cursiva explicando qué lista es.
 * Tres líneas de rótulo antes del primer proyecto, en una pantalla a la que se
 * llega pulsando «Proyectos» en la barra lateral. El título de la cabecera se
 * queda —lo pone `AppHeader`— y la frase se dobla en la línea del contador,
 * donde sigue diciendo lo mismo sin gastar un bloque.
 *
 * ## La búsqueda ya no es un callejón sin salida
 *
 * Buscar algo que no existe dejaba un párrafo suelto —«Ningún proyecto coincide
 * con X»— y **ninguna forma de volver**: había que borrar el campo a mano y
 * pulsar Enter en un formulario que ya no tenía nada escrito. Ahora el vacío es
 * un estado con su salida, y el contador de arriba dice cuántos resultados hay
 * y ofrece quitar el filtro.
 */
export function ProjectGrid({
  projects,
  total,
  currentUserId,
  search,
  equiposPorProyecto,
  crearSlot,
}: ProjectGridProps) {
  const buscando = search.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <ProjectSearch initialValue={search} />

        <p className="font-sans text-sm text-text-secondary">
          {buscando ? (
            <>
              <span className="font-semibold text-text-primary">{total}</span>{' '}
              {total === 1 ? 'resultado' : 'resultados'} para «{search}»{' '}
              <Link
                href="/"
                className="text-primary underline-offset-2 transition-colors hover:underline"
              >
                Ver todos
              </Link>
            </>
          ) : (
            <>
              <span className="font-semibold text-text-primary">{total}</span>{' '}
              {total === 1 ? 'proyecto' : 'proyectos'}{' '}
              <span className="text-text-disabled">· tuyos y donde te han añadido</span>
            </>
          )}
        </p>
      </div>

      {projects.length === 0 ? (
        <SinResultados search={search} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              currentUserId={currentUserId}
              equipo={equiposPorProyecto.get(project.id) ?? null}
              /* Misma zona → la ruta relativa y `next/link`: Next añade
                 `/projects` solo. Ver §16. */
              href={projectPath(project)}
              sameZone
              gatewayPath="/projects/api/gateway"
            />
          ))}

          {/* Cierra la rejilla. Con dos proyectos y tres columnas, la celda
              vacía estaba ahí de todas formas; así dice algo. */}
          {crearSlot && <li>{crearSlot}</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Nada coincide con la búsqueda.
 *
 * Es el único vacío que puede pintar este componente: la lista sin proyectos
 * **y sin búsqueda** la atiende `ProjectsEmptyState` desde la page, que es otra
 * cosa —ahí no hay nada que buscar, hay que crear el primero—.
 */
function SinResultados({ search }: { search: string }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-elevated text-text-disabled"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
      </span>

      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl text-text-primary">Ningún proyecto coincide</h3>
        <p className="max-w-md font-sans text-sm text-text-secondary">
          No hay nada con «{search}» en el nombre ni en la descripción, entre los proyectos que
          puedes ver.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-lg border border-border px-4 py-2 font-sans text-sm font-semibold text-text-primary transition-colors hover:border-border-strong"
      >
        Ver todos los proyectos
      </Link>
    </section>
  );
}
