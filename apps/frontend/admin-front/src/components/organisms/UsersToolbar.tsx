'use client';

import { ESTADOS } from '@/lib/admin';
import { Input, type UserStatusName } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

export interface UsersToolbarProps {
  busqueda: string;
  estado?: UserStatusName;
  total: number;
}

/** Los filtros, en el orden en que se piensan: primero «cuáles», luego «quién». */
const FILTROS: Array<{ id: 'todas' | UserStatusName; etiqueta: string }> = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'ACTIVE', etiqueta: ESTADOS.ACTIVE.etiqueta },
  { id: 'SUSPENDED', etiqueta: ESTADOS.SUSPENDED.etiqueta },
  { id: 'INACTIVE', etiqueta: ESTADOS.INACTIVE.etiqueta },
];

/**
 * Búsqueda y filtro por estado.
 *
 * Los dos escriben en la **URL** y no en estado local: el filtrado lo hace el
 * backend, la lista está paginada, y así «las cuentas suspendidas» es un enlace
 * que se puede pegar en un mensaje.
 *
 * ⚠️ **Al cambiar de filtro se vuelve a la página 1.** Sin eso, filtrar desde la
 * página 3 de 200 cuentas puede caer en una página que ya no existe y la tabla
 * sale vacía como si no hubiera resultados.
 *
 * `router.push` sin el prefijo: Next añade `/admin` solo (ESTADO-ACTUAL §16).
 */
export function UsersToolbar({ busqueda, estado, total }: UsersToolbarProps) {
  const router = useRouter();
  const [texto, setTexto] = useState(busqueda);
  const inputId = useId();

  function navegar(siguiente: { q?: string; estado?: string }) {
    const params = new URLSearchParams();
    const q = siguiente.q ?? texto.trim();
    const e = siguiente.estado ?? estado;

    if (q) params.set('q', q);
    if (e && e !== 'todas') params.set('estado', e);

    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/');
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
          placeholder="Nombre, apellido o correo"
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          fullWidth
        />
      </form>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((filtro) => {
            const activo = (estado ?? 'todas') === filtro.id;
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
          {total === 1 ? '1 cuenta' : `${total} cuentas`}
        </p>
      </div>
    </div>
  );
}
