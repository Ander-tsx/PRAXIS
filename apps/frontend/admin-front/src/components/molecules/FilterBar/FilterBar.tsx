'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

export interface FilterOption {
  /** El valor que va a la URL. El de «todos» no se escribe: ver `idTodos`. */
  id: string;
  etiqueta: string;
}

export interface FilterBarProps {
  /**
   * La ruta de esta sección **dentro de la zona**, sin el prefijo `/admin`.
   *
   * ⚠️ Next lo añade solo al navegar con `router.push`. Escribirlo aquí daría
   * `/admin/admin/proyectos` (ESTADO-ACTUAL §16).
   */
  basePath: string;
  busqueda: string;
  placeholder: string;
  /**
   * Las opciones excluyentes del carril.
   *
   * ⚠️ **Opcionales**: hay secciones que solo buscan. Organizaciones es la
   * primera —no tiene estados que filtrar, porque no se suspenden desde aquí— y
   * obligarla a declarar un filtro de una sola opción sería pintar un control
   * segmentado con un único segmento, que no es un control: es ruido.
   */
  filtros?: FilterOption[];
  /** El filtro puesto, o `undefined` cuando no hay ninguno. */
  filtroActivo?: string;
  /** El id de la opción «todos», que **no** se escribe en la URL. */
  idTodos?: string;
  total: number;
  nombreSingular: string;
  nombrePlural: string;
}

/**
 * Búsqueda y filtro de una sección del panel.
 *
 * ## Por qué existe
 *
 * `UsersToolbar` y `ProjectsToolbar` eran **el mismo archivo dos veces**: mismo
 * formulario, misma función `navegar`, mismas píldoras, mismo contador y el mismo
 * comentario sobre volver a la página 1. Lo único que cambiaba eran cuatro
 * cadenas. Dos copias de una barra de filtros es dos sitios donde arreglar el
 * siguiente fallo, y ya se notaba: el aviso de §40.5 sobre el icono del buscador
 * había que recordarlo por duplicado.
 *
 * ## El buscador lleva el icono dentro, y eso tiene una trampa
 *
 * ⚠️ **El icono va dentro del `div` que envuelve solo al `<input>`, nunca dentro
 * del que además lleva la etiqueta.** Es exactamente el fallo de §40.5: un
 * `absolute` posicionado contra el contenedor equivocado se cuelga del bloque que
 * incluye el `<label>`, así que la lupa aparece **debajo del campo** en vez de
 * dentro. No da error, se ve raro y cuesta un rato entender por qué.
 *
 * Por eso el campo se dibuja aquí a mano y no con el átomo `Input`: aquel no
 * tiene ranura para un icono, y añadírsela por este único uso sería tocar el
 * átomo que usan los siete formularios de la aplicación.
 *
 * ## Los dos escriben en la URL
 *
 * No en estado local. El filtrado lo hace el backend y la lista está paginada,
 * así que «las cuentas suspendidas» es un enlace que se puede pegar en un
 * mensaje, el botón atrás hace lo que se espera, y la página sigue siendo un
 * Server Component que pinta datos frescos en cada navegación.
 *
 * ⚠️ **Al cambiar de filtro se vuelve a la página 1.** Se consigue no arrastrando
 * `page` en `navegar`. Sin eso, filtrar desde la página 3 de 200 cuentas puede
 * caer en una página que ya no existe y la tabla sale vacía **como si no hubiera
 * resultados**, que es un fallo que se lee como un dato.
 */
export function FilterBar({
  basePath,
  busqueda,
  placeholder,
  filtros,
  filtroActivo,
  idTodos,
  total,
  nombreSingular,
  nombrePlural,
}: FilterBarProps) {
  const router = useRouter();
  const [texto, setTexto] = useState(busqueda);
  const inputId = useId();

  const hayFiltros = (filtros?.length ?? 0) > 0;
  const activo = filtroActivo ?? idTodos;
  const filtrando = busqueda.length > 0 || (hayFiltros && activo !== idTodos);

  function navegar(siguiente: { q?: string; estado?: string }) {
    const params = new URLSearchParams();
    const q = siguiente.q ?? texto.trim();
    const e = siguiente.estado ?? filtroActivo;

    if (q) params.set('q', q);
    if (e && e !== idTodos) params.set('estado', e);

    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function limpiar() {
    setTexto('');
    router.push(basePath);
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          navegar({});
        }}
        className="w-full lg:max-w-sm"
      >
        <label htmlFor={inputId} className="sr-only">
          Buscar
        </label>

        {/* ⚠️ `relative` aquí, envolviendo SOLO al input. Ver la nota de arriba. */}
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
          </span>

          <input
            id={inputId}
            name="q"
            type="search"
            placeholder={placeholder}
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 font-sans text-sm text-text-primary outline-none transition-all duration-150 placeholder:text-white hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/**
         * Un control segmentado, no cuatro botones sueltos.
         *
         * El carril con fondo dice que las opciones son **excluyentes** —solo una
         * puede estar puesta— que es justo lo que cuatro píldoras separadas
         * flotando sobre el fondo no comunicaban: se leían como cuatro filtros
         * que se pudieran combinar.
         */}
        {/* `<fieldset>` y no un `div` con `role="group"`: es el elemento que
            existe para esto, y el rótulo va en un `<legend>` en vez de en un
            `aria-label` que solo oyen los lectores de pantalla. */}
        {hayFiltros && (
          <fieldset className="flex flex-wrap gap-0.5 rounded-xl bg-white/[0.04] p-1">
            <legend className="sr-only">Filtrar por estado</legend>
            {(filtros ?? []).map((filtro) => {
              const puesto = activo === filtro.id;
              return (
                <button
                  key={filtro.id}
                  type="button"
                  onClick={() => navegar({ estado: filtro.id })}
                  aria-pressed={puesto}
                  className={`rounded-lg px-3 py-1.5 font-sans text-xs font-semibold transition-colors ${
                    puesto
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {filtro.etiqueta}
                </button>
              );
            })}
          </fieldset>
        )}

        <p className="font-sans text-xs text-white">
          <span className="font-semibold tabular-nums text-text-primary">{total}</span>{' '}
          {total === 1 ? nombreSingular : nombrePlural}
          {/* La salida del filtro, junto al número que el filtro ha cambiado.
              Sin esto había que borrar el campo a mano y volver a pulsar
              «Todas», que es el callejón sin salida que ya se arregló una vez en
              la rejilla de proyectos (§40.4). */}
          {filtrando && (
            <>
              {' · '}
              <button
                type="button"
                onClick={limpiar}
                className="font-semibold text-primary underline-offset-2 transition-colors hover:underline"
              >
                Quitar filtros
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
