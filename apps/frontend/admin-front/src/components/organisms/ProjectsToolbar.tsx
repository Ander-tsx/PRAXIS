'use client';

import { Input, type ProjectStatusName } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ESTADOS_PROYECTO } from '@/lib/admin';

export interface ProjectsToolbarProps {
  busqueda: string;
  estado?: ProjectStatusName;
  total: number;
}

/**
 * Los filtros del inventario.
 *
 * ⚠️ **«Todos» incluye los archivados**, y es a propósito: este es el único sitio de
 * la plataforma donde se ven, así que esconderlos tras un filtro que hay que
 * descubrir haría que un proyecto archivado por error pareciera perdido. En las
 * pantallas de negocio no salen en ninguna lista.
 */
const FILTROS: Array<{ id: 'todos' | ProjectStatusName; etiqueta: string }> = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'ACTIVE', etiqueta: ESTADOS_PROYECTO.ACTIVE.etiqueta },
  { id: 'SUSPENDED', etiqueta: ESTADOS_PROYECTO.SUSPENDED.etiqueta },
  { id: 'DELETED', etiqueta: ESTADOS_PROYECTO.DELETED.etiqueta },
];

/**
 * Búsqueda y filtro por estado, los dos en la **URL**.
 *
 * El filtrado lo hace el backend y la lista está paginada, así que «los proyectos
 * suspendidos» es un enlace que se puede pegar en un mensaje, y el botón atrás hace
 * lo que se espera.
 *
 * ⚠️ **Al cambiar de filtro se vuelve a la página 1.** Sin eso, filtrar desde la
 * página 3 cae en una página que ya no existe y la tabla sale vacía como si no
 * hubiera resultados.
 *
 * `router.push` sin el prefijo: Next añade `/admin` solo (ESTADO-ACTUAL §16).
 */
export function ProjectsToolbar({ busqueda, estado, total }: ProjectsToolbarProps) {
  const router = useRouter();
  const [texto, setTexto] = useState(busqueda);
  const inputId = useId();

  function navegar(siguiente: { q?: string; estado?: string }) {
    const params = new URLSearchParams();
    const q = siguiente.q ?? texto.trim();
    const e = siguiente.estado ?? estado;

    if (q) params.set('q', q);
    if (e && e !== 'todos') params.set('estado', e);

    const qs = params.toString();
    router.push(qs ? `/proyectos?${qs}` : '/proyectos');
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          navegar({});
        }}
        className="w-full max-w-sm"
      >
        <Input
          id={inputId}
          name="q"
          type="search"
          label="Buscar"
          placeholder="Nombre o descripción del proyecto"
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          fullWidth
        />
      </form>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((filtro) => {
            const activo = (estado ?? 'todos') === filtro.id;
            return (
              <button
                key={filtro.id}
                type="button"
                onClick={() => navegar({ estado: filtro.id })}
                aria-pressed={activo}
                className={`rounded-lg px-3 py-1.5 font-sans text-xs font-semibold transition-colors ${
                  activo
                    ? 'bg-primary text-primary-foreground'
                    : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
                }`}
              >
                {filtro.etiqueta}
              </button>
            );
          })}
        </div>

        <p className="font-sans text-xs text-text-secondary">
          {total === 1 ? '1 proyecto' : `${total} proyectos`}
        </p>
      </div>
    </div>
  );
}
