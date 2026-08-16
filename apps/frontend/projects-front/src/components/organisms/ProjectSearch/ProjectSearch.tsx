'use client';

import { Input } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

export interface ProjectSearchProps {
  initialValue: string;
}

/**
 * Búsqueda de proyectos.
 *
 * Escribe en la URL (`?q=`) en vez de guardar estado local: el filtrado lo hace
 * el backend, la lista está paginada y así la búsqueda se puede compartir y
 * sobrevive a un refresco.
 *
 * `router.push` sin el basePath: Next añade `/projects` solo. Ver ESTADO-ACTUAL §16.
 *
 * ## Se busca al pulsar Enter, no al teclear
 *
 * Cada pulsación sería una consulta al gateway y una navegación del App Router.
 * Con el filtrado en el servidor y la lista paginada, el rebote tendría que ser
 * largo para no castigar, y un rebote largo se siente **roto**: escribes, no
 * pasa nada, y cuando ya has dejado de mirar, la lista salta. Enter es
 * instantáneo y no engaña. La lupa lo dice sin escribirlo.
 *
 * ⚠️ **El relleno del icono va en `style`, no en una clase.** `Input` concatena
 * el `className` que le pasan detrás de su propio `px-3`, pero quién gana entre
 * `px-3` y `pl-10` depende del orden en que Tailwind emitió las dos reglas, no
 * del orden en el atributo — la misma trampa que documenta ESTADO-ACTUAL §27.5
 * con `h-full`. Un estilo en línea no tiene esa ambigüedad.
 */
export function ProjectSearch({ initialValue }: ProjectSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const inputId = useId();

  function buscar(query: string) {
    const limpio = query.trim();
    router.push(limpio ? `/?q=${encodeURIComponent(limpio)}` : '/');
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        buscar(value);
      }}
      /* Sin `role="search"`: el analizador pide el elemento `<search>` en su
         lugar, que aún no está en todos los navegadores que soportamos, y aquí
         no aporta nada — el campo ya se anuncia con su `aria-label`. */
      className="relative w-full max-w-sm"
    >
      {/**
       * ⚠️ **`z-10`, o el icono se pinta debajo del campo.**
       *
       * El `<span>` está posicionado y el `<input>` no, así que por el orden de
       * pintado «debería» quedar encima — y no queda: el fondo sólido del campo
       * lo tapaba entero. Se vio midiendo en el navegador, con el icono en el
       * DOM, con su color y en sus 16×16 px exactos sobre el campo, y aun así
       * invisible; con `z-index: 10` aparece. Lo mismo vale para el botón de
       * limpiar de abajo.
       *
       * ⚠️ Y `text-secondary`, no `text-disabled`: en tema claro aquel gris
       * (#a4a9ba) sobre el fondo del campo (#eceef5) da 1,7:1. Un adorno puede
       * permitirse ser tenue; esto dice para qué sirve el campo.
       */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-secondary"
      >
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

      <Input
        id={inputId}
        name="q"
        /* `type="search"` trae la equis nativa del navegador, que **no dispara
           el submit**: borraba el campo y dejaba la lista filtrada como estaba.
           Con `text` la única forma de limpiar es la nuestra, que sí navega. */
        type="text"
        placeholder="Buscar por nombre o descripción"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Buscar proyectos"
        style={{ paddingLeft: '2.25rem', paddingRight: value ? '2.25rem' : undefined }}
        fullWidth
      />

      {value && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            buscar('');
          }}
          aria-label="Quitar la búsqueda"
          title="Quitar la búsqueda"
          className="absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </form>
  );
}
