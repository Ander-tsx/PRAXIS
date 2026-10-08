'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FIELD_BOX } from '../section-panel';
import { swallowEscape } from './swallow-escape';

export interface TokenItem {
  id: string;
  /** El texto: lo que se busca y lo que se lee. */
  label: string;
  /** Lo que va delante del texto en la ficha y en la lista: una cara, un punto de color. */
  leading?: React.ReactNode;
  /** Color de la ficha (las etiquetas y las opciones lo llevan; las personas no). */
  tone?: string;
}

/**
 * Elegir varias cosas —personas, etiquetas, opciones— **en un solo control**.
 *
 * Lo elegido son fichas dentro de la caja; lo que falta, una lista que se
 * despliega debajo al escribir o al pulsar. Antes eran dos cosas pegadas —el
 * resumen arriba y la lista entera de casillas debajo— y el dueño del producto
 * lo vio, con razón, como lo mismo duplicado (2026-10-08).
 *
 * Teclado: escribir filtra; ↑/↓ mueve el resaltado; Enter elige; Retroceso con
 * la caja vacía quita la última ficha; Escape cierra la lista sin cerrar el
 * panel de la tarea (`swallowEscape`). Pulsar fuera también la cierra.
 *
 * ⚠️ La lista se pinta **dentro del panel**, no en un portal: el panel se cierra
 * con cualquier clic fuera de él, y un portal está fuera.
 */
export function TokenPicker({
  label,
  items,
  selected,
  onChange,
  disabled = false,
  placeholder,
  emptyText = 'Nada todavía',
  noItemsText = 'No hay nada que elegir.',
  footer,
}: {
  /** Nombre accesible del control: «Encargados», «Etiquetas», «Reviewer». */
  label: string;
  items: TokenItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Lo que se lee en la caja cuando está vacía: «Añadir persona…». */
  placeholder: string;
  /** Sin permiso y sin nada elegido. */
  emptyText?: string;
  /** Cuando no hay nada en el catálogo (un proyecto sin etiquetas). */
  noItemsText?: string;
  /** Debajo de la lista: una nota, o «Gestionar etiquetas». */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const chosen = selected.map((id) => byId.get(id) ?? { id, label: 'Ya no está disponible' });

  const available = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return items.filter(
      (item) =>
        !selected.includes(item.id) && (!q || item.label.toLocaleLowerCase('es').includes(q)),
    );
  }, [items, selected, query]);

  /* Pulsar fuera cierra. `pointerdown`, como el resto de desplegables: con
     `click`, el botón de debajo recibiría el suyo en el mismo gesto. */
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  /* El resaltado nunca apunta fuera de la lista filtrada. */
  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, available.length - 1)));
  }, [available.length]);

  function add(id: string) {
    onChange([...selected, id]);
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s !== id));
  }

  if (disabled) {
    return chosen.length === 0 ? (
      <p className="min-h-10 py-2 font-sans text-sm text-text-secondary">{emptyText}</p>
    ) : (
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 py-1.5">
        {chosen.map((item) => (
          <Token key={item.id} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          swallowEscape(event);
          setOpen(false);
          setQuery('');
        }
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <div
        className={`flex min-h-10 cursor-text flex-wrap items-center gap-1.5 px-1.5 py-1.5 ${FIELD_BOX}`}
      >
        {chosen.map((item) => (
          <Token key={item.id} item={item} onRemove={() => remove(item.id)} />
        ))}
        <input
          ref={inputRef}
          role="combobox"
          aria-label={`Añadir a ${label}`}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && available[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={chosen.length === 0 ? placeholder : ''}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, available.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === 'Enter') {
              /* Enter elige; nunca envía el formulario del panel. */
              event.preventDefault();
              const item = available[active];
              if (open && item) add(item.id);
            } else if (event.key === 'Backspace' && query === '' && selected.length > 0) {
              remove(selected[selected.length - 1]);
            }
          }}
          /* Con fichas, el campo cede sitio: si no, una ficha larga lo empujaba a
             una segunda línea vacía. Sin fichas, ancho para leer el texto de ayuda. */
          className={`h-7 flex-1 bg-transparent px-1.5 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary ${
            chosen.length > 0 ? 'min-w-[3rem]' : 'min-w-[7rem]'
          }`}
        />
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 origin-top animate-desplegar-menu overflow-hidden rounded-xl border border-white/[0.12] bg-surface-elevated shadow-xl shadow-black/30">
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-60 overflow-y-auto p-1"
          >
            {available.map((item, index) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: el teclado lo lleva el combobox (↑/↓ y Enter)
              <li
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                /* Sin perder el foco del campo al pulsar. */
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => add(item.id)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 font-sans text-sm text-text-primary ${
                  index === active ? 'bg-white/[0.08]' : ''
                }`}
              >
                {item.leading}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </li>
            ))}
            {available.length === 0 && (
              <li className="px-2.5 py-2 font-sans text-xs text-text-secondary">
                {items.length === 0 ? noItemsText : query ? 'Nada coincide.' : 'Ya están todos.'}
              </li>
            )}
          </ul>
          {footer && <div className="border-t border-white/[0.08] px-3 py-2">{footer}</div>}
        </div>
      )}
    </div>
  );
}

/** Una ficha: lo que va delante, el texto recortado y, si se puede, su «×». */
function Token({ item, onRemove }: { item: TokenItem; onRemove?: () => void }) {
  const toned = item.tone !== undefined;
  return (
    <span
      className={`inline-flex h-7 max-w-[min(100%,15rem)] min-w-0 items-center gap-1.5 rounded-full font-sans text-[13px] ${
        toned ? 'px-2.5 font-medium' : 'bg-white/[0.08] pr-1.5 pl-0.5 text-text-primary'
      } ${onRemove ? '' : 'pr-2'}`}
      style={
        toned
          ? { background: `color-mix(in srgb, ${item.tone} 18%, transparent)`, color: item.tone }
          : undefined
      }
    >
      {item.leading}
      <span className="min-w-0 truncate">{item.label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Quitar a ${item.label}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full opacity-60 transition-opacity hover:bg-white/10 hover:opacity-100"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
