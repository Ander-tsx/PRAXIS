'use client';

import { useMemo, useState } from 'react';
import { EnlaceDeRiel, GrupoDeRiel } from '../Documentos/riel';

export interface EntradaDeIndice {
  slug: string;
  titulo: string;
  resumen: string;
  categoria: string;
  /** Todo el texto del artículo, ya aplanado, para que el buscador mire dentro. */
  texto: string;
}

/** Sin acentos y en minúsculas: «Facturación» se encuentra escribiendo «facturacion». */
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * El índice de la ayuda: buscador y artículos por categoría.
 *
 * Es un componente de cliente solo por el buscador; la lista llega ya resuelta
 * desde el servidor, así que no pide nada.
 */
export function IndiceDeAyuda({
  entradas,
  categorias,
  activo,
}: {
  entradas: EntradaDeIndice[];
  categorias: string[];
  activo?: string;
}) {
  const [consulta, setConsulta] = useState('');

  const visibles = useMemo(() => {
    const q = normalizar(consulta.trim());
    if (!q) return entradas;
    return entradas.filter((e) => normalizar(`${e.titulo} ${e.resumen} ${e.texto}`).includes(q));
  }, [consulta, entradas]);

  return (
    <nav aria-label="Índice de la ayuda" className="flex flex-col gap-5">
      <label className="relative block">
        <span className="sr-only">Buscar en la ayuda</span>
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
        <input
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar en la ayuda…"
          className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 font-sans text-[13px] text-text-primary placeholder-text-secondary focus:border-border-strong focus:outline-none"
        />
      </label>

      {visibles.length === 0 ? (
        <p className="px-1 font-sans text-[13px] text-text-secondary">
          Nada coincide con «{consulta}». Prueba con otra palabra.
        </p>
      ) : (
        categorias.map((categoria) => {
          const delGrupo = visibles.filter((e) => e.categoria === categoria);
          if (delGrupo.length === 0) return null;
          return (
            <GrupoDeRiel key={categoria} titulo={categoria}>
              {delGrupo.map((e) => (
                <EnlaceDeRiel key={e.slug} href={`/ayuda/${e.slug}`} activo={e.slug === activo}>
                  {e.titulo}
                </EnlaceDeRiel>
              ))}
            </GrupoDeRiel>
          );
        })
      )}
    </nav>
  );
}
