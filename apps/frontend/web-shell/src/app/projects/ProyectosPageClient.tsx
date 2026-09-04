'use client';

import {
  Avatar,
  Pagination,
  type Project,
  ProjectMonogram,
  type UserProfile,
  avatarHref,
  projectHref,
} from '@praxis/commons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState, useTransition } from 'react';

const dateFmt = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

interface ProyectosPageClientProps {
  projects: Project[];
  total: number;
  pagina: number;
  porPagina: number;
  search: string;
  vistaActual: 'lista' | 'grilla';
  currentUserId: string;
  equiposPorProyecto: Record<string, UserProfile[] | null>;
  crearTrigger: ReactNode;
}

export function ProyectosPageClient({
  projects,
  total,
  pagina,
  porPagina,
  search,
  vistaActual,
  currentUserId,
  equiposPorProyecto,
  crearTrigger,
}: ProyectosPageClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [, startTransition] = useTransition();

  const hrefDePagina = (n: number) => {
    const otros = new URLSearchParams();
    if (search) otros.set('q', search);
    if (n > 1) otros.set('page', String(n));
    if (vistaActual !== 'lista') otros.set('vista', vistaActual);
    const cadena = otros.toString();
    return cadena ? `/?${cadena}` : '/';
  };

  function buscar(q: string) {
    const trimmed = q.trim();
    startTransition(() => {
      router.push(trimmed ? `/?q=${encodeURIComponent(trimmed)}` : '/');
    });
  }

  function cambiarVista(v: 'lista' | 'grilla') {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (v !== 'lista') params.set('vista', v);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : '/'));
  }

  const hayProyectos = projects.length > 0;
  const buscando = search.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Barra de herramientas ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Búsqueda */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            buscar(query);
          }}
          className="relative flex-1 min-w-0 max-w-sm"
        >
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white">
            <svg
              className="h-4 w-4"
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
          <input
            type="text"
            placeholder="Buscar proyectos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar proyectos"
            className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-14 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/25 focus:bg-white/[0.07]"
          />
          {query && query !== search && (
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-medium uppercase text-white">
              Enter
            </div>
          )}
          {query && query === search && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                buscar('');
              }}
              aria-label="Quitar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-secondary hover:text-white transition-colors"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </form>

        {/* Selector de vista */}
        <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => cambiarVista('lista')}
            title="Vista lista"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              vistaActual === 'lista'
                ? 'bg-white/10 text-white'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Lista
          </button>
          <button
            type="button"
            onClick={() => cambiarVista('grilla')}
            title="Vista grilla"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              vistaActual === 'grilla'
                ? 'bg-white/10 text-white'
                : 'text-text-secondary hover:text-white'
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
              <rect x="3.5" y="14" width="7" height="6" rx="1.5" />
              <rect x="13.5" y="14" width="7" height="6" rx="1.5" />
            </svg>
            Grilla
          </button>
        </div>

        {/* Nuevo proyecto */}
        {crearTrigger}
      </div>

      {/* ── Contador ─────────────────────────────────────────────── */}
      {hayProyectos && (
        <p className="text-sm text-white -mt-1">
          {buscando ? (
            <>
              <span className="font-medium text-white">{total}</span>{' '}
              {total === 1 ? 'resultado' : 'resultados'} para «{search}»{'  ·  '}
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  buscar('');
                }}
                className="text-text-secondary hover:text-white transition-colors underline-offset-2 hover:underline"
              >
                Ver todos
              </button>
            </>
          ) : (
            <>
              <span className="font-medium text-white">{total}</span>{' '}
              {total === 1 ? 'proyecto' : 'proyectos'}
            </>
          )}
        </p>
      )}

      {/* ── Estado vacío ─────────────────────────────────────────── */}
      {!hayProyectos && !buscando && <EstadoVacioNuevo crearTrigger={crearTrigger} />}

      {!hayProyectos && buscando && (
        <SinResultados
          search={search}
          onLimpiar={() => {
            setQuery('');
            buscar('');
          }}
        />
      )}

      {/* ── Contenido ────────────────────────────────────────────── */}
      {hayProyectos && vistaActual === 'lista' && (
        <ProyectosLista
          projects={projects}
          currentUserId={currentUserId}
          equiposPorProyecto={equiposPorProyecto}
        />
      )}

      {hayProyectos && vistaActual === 'grilla' && (
        <ProyectosGrilla
          projects={projects}
          currentUserId={currentUserId}
          equiposPorProyecto={equiposPorProyecto}
        />
      )}

      {/* Paginación */}
      {hayProyectos && (
        <Pagination
          page={pagina}
          limit={porPagina}
          total={total}
          hrefFor={hrefDePagina}
          nombre="proyectos"
        />
      )}
    </div>
  );
}

// ── Vista Lista ────────────────────────────────────────────────────────────

function ProyectosLista({
  projects,
  currentUserId,
  equiposPorProyecto,
}: {
  projects: Project[];
  currentUserId: string;
  equiposPorProyecto: Record<string, UserProfile[] | null>;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.08]">
      {/* Cabecera */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-white/[0.06] px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white">
          Proyecto
        </span>
        <span className="hidden w-28 text-right text-[11px] font-semibold uppercase tracking-wider text-white md:block">
          Equipo
        </span>
        <span className="hidden w-20 text-right text-[11px] font-semibold uppercase tracking-wider text-white lg:block">
          Espacios
        </span>
        <span className="hidden w-28 text-right text-[11px] font-semibold uppercase tracking-wider text-white sm:block">
          Creado
        </span>
      </div>

      {projects.map((project, i) => {
        const suspendido = project.status === 'SUSPENDED';
        const eresElDueno = project.ownerId === currentUserId;

        return (
          <Link
            key={project.id}
            href={projectHref(project)}
            className={`group grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.04] ${
              i > 0 ? 'border-t border-white/[0.05]' : ''
            }`}
          >
            {/* Nombre + monograma */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0">
                <ProjectMonogram
                  id={project.id}
                  name={project.name}
                  iconKey={project.iconKey ?? null}
                  color={project.color ?? null}
                  apagado={suspendido}
                />
              </span>
              <div className="min-w-0">
                <p
                  className={`truncate text-[13px] font-medium transition-colors ${
                    suspendido ? 'text-white' : 'text-white group-hover:text-white'
                  }`}
                >
                  {project.name}
                </p>
                <p className="truncate text-[11px] text-white">
                  {suspendido ? (
                    <span className="text-amber-500/60">Suspendido</span>
                  ) : eresElDueno ? (
                    'Tuyo'
                  ) : (
                    'Te añadieron'
                  )}
                  {project.description && !suspendido && (
                    <span className="ml-1.5 hidden sm:inline">
                      · {project.description.slice(0, 70)}
                      {project.description.length > 70 ? '…' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Equipo */}
            <div className="hidden w-28 items-center justify-end md:flex">
              <div className="flex items-center -space-x-1">
                {equiposPorProyecto[project.id]?.slice(0, 3).map((user) => (
                  <div
                    key={user.id}
                    className="relative rounded-full ring-2 ring-[#080807] bg-[#191919]"
                  >
                    <Avatar
                      label={
                        user.firstName
                          ? `${user.firstName} ${user.lastName || ''}`
                          : user.credential?.email || 'U'
                      }
                      src={avatarHref(user.avatarUrl, '/api/gateway')}
                      mine={user.id === currentUserId}
                      size="base"
                    />
                  </div>
                ))}
                {(equiposPorProyecto[project.id]?.length ?? 0) > 3 && (
                  <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-white ring-2 ring-[#080807]">
                    +{equiposPorProyecto[project.id]!.length - 3}
                  </div>
                )}
              </div>
            </div>

            {/* Espacios */}
            <div className="hidden w-20 items-center justify-end lg:flex">
              <span className="text-xs text-white">
                {project._count.workspaces}{' '}
                {project._count.workspaces === 1 ? 'espacio' : 'espacios'}
              </span>
            </div>

            {/* Fecha */}
            <div className="hidden w-28 items-center justify-end sm:flex">
              <span className="tabular-nums text-xs text-white">
                {dateFmt.format(new Date(project.createdAt))}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Vista Grilla ────────────────────────────────────────────────────────────

function ProyectosGrilla({
  projects,
  currentUserId,
  equiposPorProyecto,
}: {
  projects: Project[];
  currentUserId: string;
  equiposPorProyecto: Record<string, UserProfile[] | null>;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const suspendido = project.status === 'SUSPENDED';
        const eresElDueno = project.ownerId === currentUserId;

        return (
          <li key={project.id} className="group/item">
            <Link
              href={projectHref(project)}
              className={`group flex flex-col h-full gap-3 rounded-xl border border-white/[0.08] p-4 transition-all duration-150 hover:border-white/[0.16] hover:bg-white/[0.03] ${
                suspendido ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <ProjectMonogram
                  id={project.id}
                  name={project.name}
                  iconKey={project.iconKey ?? null}
                  color={project.color ?? null}
                  apagado={suspendido}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white transition-colors group-hover:text-white">
                    {project.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white">
                    {suspendido ? (
                      <span className="text-amber-500/60">Suspendido</span>
                    ) : eresElDueno ? (
                      'Tuyo'
                    ) : (
                      'Te añadieron'
                    )}
                  </p>
                </div>
              </div>

              {project.description && (
                <p className="line-clamp-2 text-[12px] leading-relaxed text-white">
                  {project.description}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-xs text-white">
                <div className="flex items-center gap-4">
                  <span
                    className="flex items-center gap-1"
                    title={`${project._count.workspaces} espacios`}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    >
                      <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
                      <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
                      <rect x="3.5" y="14" width="7" height="6" rx="1.5" />
                      <rect x="13.5" y="14" width="7" height="6" rx="1.5" />
                    </svg>
                    {project._count.workspaces}
                  </span>
                  <span className="tabular-nums">
                    {dateFmt.format(new Date(project.createdAt))}
                  </span>
                </div>

                <div className="flex items-center -space-x-1">
                  {equiposPorProyecto[project.id]?.slice(0, 3).map((user) => (
                    <div
                      key={user.id}
                      className="relative rounded-full ring-2 ring-[#131312] bg-[#191919] group-hover:ring-[#161615] group-hover:bg-[#161615] transition-colors"
                    >
                      <Avatar
                        label={
                          user.firstName
                            ? `${user.firstName} ${user.lastName || ''}`
                            : user.credential?.email || 'U'
                        }
                        src={avatarHref(user.avatarUrl, '/api/gateway')}
                        mine={user.id === currentUserId}
                        size="base"
                      />
                    </div>
                  ))}
                  {(equiposPorProyecto[project.id]?.length ?? 0) > 3 && (
                    <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-white ring-2 ring-[#131312] group-hover:ring-[#161615] transition-colors">
                      +{equiposPorProyecto[project.id]!.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ── Estado vacío (sin proyectos) ───────────────────────────────────────────

function EstadoVacioNuevo({ crearTrigger }: { crearTrigger: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-xl border border-white/[0.08] py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white">
        <svg
          className="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-white">Sin proyectos todavía</h2>
        <p className="max-w-xs text-sm text-white">
          Crea tu primer proyecto o pide que te añadan a uno existente.
        </p>
      </div>
      {crearTrigger}
    </div>
  );
}

// ── Sin resultados de búsqueda ─────────────────────────────────────────────

function SinResultados({ search, onLimpiar }: { search: string; onLimpiar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border border-white/[0.08] py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white">
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
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-white">Sin resultados para «{search}»</h3>
        <p className="max-w-xs text-sm text-white">
          No hay proyectos con ese nombre entre los que puedes ver.
        </p>
      </div>
      <button
        type="button"
        onClick={onLimpiar}
        className="rounded-lg border border-white/[0.10] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:text-white"
      >
        Ver todos los proyectos
      </button>
    </div>
  );
}
