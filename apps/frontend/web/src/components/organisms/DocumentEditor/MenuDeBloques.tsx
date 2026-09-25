'use client';

import type { Editor, Range } from '@tiptap/core';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Bloque } from './bloques';

export interface MenuDeBloquesProps {
  bloques: Bloque[];
  editor: Editor;
  range: Range;
  command: (bloque: Bloque) => void;
}

export interface MenuDeBloquesRef {
  onKeyDown: (evento: KeyboardEvent) => boolean;
}

/**
 * El menú que abre «/»: los bloques, agrupados, filtrados por lo que se
 * escribe, con flechas y Enter. Es lo que hace que un documento se escriba
 * sin buscar botones.
 */
export const MenuDeBloques = forwardRef<MenuDeBloquesRef, MenuDeBloquesProps>(
  function MenuDeBloques({ bloques, command }, ref) {
    const [activo, setActivo] = useState(0);
    const lista = useRef<HTMLDivElement>(null);

    // biome-ignore lint/correctness/useExhaustiveDependencies: al cambiar lo filtrado, la selección vuelve arriba
    useEffect(() => setActivo(0), [bloques]);
    useEffect(() => {
      lista.current
        ?.querySelector(`[data-indice="${activo}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [activo]);

    useImperativeHandle(ref, () => ({
      onKeyDown(evento) {
        if (bloques.length === 0) return false;
        if (evento.key === 'ArrowDown') {
          setActivo((a) => (a + 1) % bloques.length);
          return true;
        }
        if (evento.key === 'ArrowUp') {
          setActivo((a) => (a - 1 + bloques.length) % bloques.length);
          return true;
        }
        if (evento.key === 'Enter' || evento.key === 'Tab') {
          const elegido = bloques[activo];
          if (elegido) command(elegido);
          return true;
        }
        return false;
      },
    }));

    if (bloques.length === 0) {
      return (
        <div className="w-72 rounded-xl border border-border bg-surface px-3 py-2.5 font-sans text-xs text-text-secondary shadow-2xl">
          Ningún bloque se llama así
        </div>
      );
    }

    let grupoAnterior = '';
    return (
      /* Sin `role="listbox"`: el foco se queda en el editor y la lista se maneja
         con las flechas desde ahí. */
      <div
        ref={lista}
        aria-label="Insertar un bloque"
        className="scrollbar-slim max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl"
      >
        {bloques.map((bloque, indice) => {
          const cabecera = bloque.grupo !== grupoAnterior;
          grupoAnterior = bloque.grupo;
          return (
            <div key={bloque.id}>
              {cabecera && (
                <p className="px-2.5 pb-1 pt-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                  {bloque.grupo}
                </p>
              )}
              <button
                type="button"
                aria-current={indice === activo}
                data-indice={indice}
                onMouseEnter={() => setActivo(indice)}
                onMouseDown={(e) => {
                  /* `mousedown` y no `click`: el editor pierde el foco con el
                     primero y el rango del «/» deja de valer. */
                  e.preventDefault();
                  command(bloque);
                }}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  indice === activo ? 'bg-white/[0.07]' : ''
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-text-primary">
                  {bloque.icono}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-sans text-sm text-text-primary">{bloque.titulo}</span>
                  <span className="truncate font-sans text-[11px] text-text-secondary">
                    {bloque.detalle}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    );
  },
);
