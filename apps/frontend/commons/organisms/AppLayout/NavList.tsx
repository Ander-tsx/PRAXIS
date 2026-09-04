'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { colors } from '../../tokens';
import type { AppNavItem } from './navigation';

/**
 * ⚠️ **Aviso de React en desarrollo, sin resolver: «Each child in a list should
 * have a unique "key" prop … render method of `NavList`».**
 *
 * Salta en cada hidratación (2× por `StrictMode`) y **no vuelve a saltar** en
 * los re-renders — el elemento que lo dispara se valida una vez y se marca. Es
 * de desarrollo: la build de producción no comprueba claves.
 *
 * Descartado, comprobado en el navegador: las listas de `NavList` llevan clave
 * (`grupo.clave`, `claveItem`); los iconos tampoco son —clonarlos con `key` no
 * lo calla—; los `<svg>` de varios trazos van envueltos en `<g>` para tener un
 * solo hijo y aun así salta. Queda por capturar el `owner stack` real antes de
 * la hidratación, que es lo único que dirá qué array es.
 */

/**
 * El enlace activo es el que **más** coincide con la ruta, no cualquiera que sea
 * prefijo suyo.
 *
 * Con la comparación por prefijo a secas, en `/dashboard/notifications` se
 * encendían dos a la vez: «Panel» (`/dashboard`) y «Notificaciones». Ganar por
 * longitud resuelve el caso general —una sección dentro de otra— sin listar
 * excepciones, y sigue haciendo lo correcto con una pantalla que **no** tiene
 * entrada propia: ahí se queda encendido «Panel», el prefijo que sí la tiene.
 */
function activeHrefOf(activePath: string, navItems: AppNavItem[]): string | null {
  let best: string | null = null;

  for (const item of navItems) {
    if (item.disabled) continue;
    const matches = activePath === item.href || activePath.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }

  return best;
}

interface Grupo {
  /** Índice del grupo en `APP_NAV_ITEMS`, no el nombre — dos grupos podrían
   * compartir `section` en teoría, y una clave por posición no colisiona
   * aunque eso llegara a pasar. */
  clave: string;
  section: string;
  items: AppNavItem[];
}

/**
 * Agrupa preservando el orden de llegada — no alfabético, es el orden en que
 * `APP_NAV_ITEMS` los declara.
 */
function agruparPorSeccion(navItems: AppNavItem[]): Grupo[] {
  const grupos: Grupo[] = [];

  for (const item of navItems) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.section === item.section) {
      ultimo.items.push(item);
    } else {
      grupos.push({
        clave: `grupo-${grupos.length}-${item.section}`,
        section: item.section,
        items: [item],
      });
    }
  }

  return grupos;
}

export function NavList({
  navItems,
  activePath,
  onNavigate,
  plegada = false,
}: {
  navItems: AppNavItem[];
  activePath: string;
  onNavigate?: () => void;
  /**
   * Solo los iconos.
   *
   * ⚠️ **El texto se sigue renderizando**, escondido con `sr-only`, en vez de
   * quitarlo del árbol. Un icono suelto sin nombre accesible es un enlace que
   * un lector de pantalla anuncia como «enlace» y nada más, y esta es la
   * navegación principal de la aplicación: plegarla no puede costar el acceso.
   *
   * El `title` da la misma información al ratón, que es lo que se pierde
   * visualmente al plegar. Las etiquetas de grupo tampoco se pintan plegada:
   * un rótulo de texto sobre una columna de iconos no tiene dónde apoyarse, y
   * la raya que separa los grupos ya dice que ahí empieza otro bloque. Por lo
   * mismo, plegada ningún grupo se puede compactar: no hay cabecera donde
   * pulsar.
   */
  plegada?: boolean;
}) {
  const activeHref = activeHrefOf(activePath, navItems);
  const grupos = agruparPorSeccion(navItems);

  /**
   * Qué grupos están compactados, por `clave`.
   */
  const [compactados, setCompactados] = useState<Set<string>>(new Set());

  // Cargar estado inicial
  useEffect(() => {
    try {
      const guardado = localStorage.getItem('praxis_nav_compactados');
      if (guardado) setCompactados(new Set(JSON.parse(guardado)));
    } catch (e) {}
  }, []);

  function alternar(clave: string) {
    setCompactados((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) {
        siguiente.delete(clave);
      } else {
        siguiente.add(clave);
      }
      try {
        localStorage.setItem('praxis_nav_compactados', JSON.stringify([...siguiente]));
      } catch (e) {}
      return siguiente;
    });
  }

  return (
    <nav className="flex flex-col gap-4" aria-label="Secciones">
      {grupos.map((grupo) => {
        const compactado = !plegada && compactados.has(grupo.clave);

        return (
          <div key={grupo.clave} className="flex flex-col gap-1">
            {/* Una raya fina encima de **cada** sección, no solo a partir de la
                segunda: el grupo de arriba también necesita despegarse de lo que
                tiene encima (el árbol de proyectos, el selector de organización). */}
            <div
              className={
                plegada ? 'mx-1 mb-1 border-t border-border' : 'mb-1 border-t border-border'
              }
              aria-hidden="true"
            />
            {!plegada && (
              <button
                type="button"
                onClick={() => alternar(grupo.clave)}
                aria-expanded={!compactado}
                className="group/section mx-1 flex items-center justify-between gap-2 rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-white transition-colors hover:text-white"
              >
                {grupo.section}
                <svg
                  className={`h-3.5 w-3.5 shrink-0 text-white transition-transform duration-200 ease-out group-hover/section:text-white ${
                    compactado ? '-rotate-90' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.25}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}

            {/* El truco del grid para animar 0↔auto: la fila colapsa a
                `0fr` con una transición normal —a diferencia de una
                `@keyframes`, esta sí interpola en las dos direcciones— y el
                hijo necesita su propio `overflow-hidden` + `min-height: 0`
                para poder encogerse por debajo de lo que mide su
                contenido. */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,0.85,0.28,1)]"
              style={{ gridTemplateRows: compactado ? '0fr' : '1fr' }}
            >
              <div
                className="flex min-h-0 flex-col gap-1 overflow-hidden transition-opacity duration-200"
                style={{ opacity: compactado ? 0 : 1 }}
              >
                {grupo.items.map((item, idx) => {
                  const active = !item.disabled && item.href === activeHref;
                  const claveItem = `${grupo.clave}::${item.href}::${idx}`;

                  if (item.disabled) {
                    return (
                      <span
                        key={claveItem}
                        aria-disabled="true"
                        title={
                          plegada
                            ? `${item.label} — disponible próximamente`
                            : 'Disponible próximamente'
                        }
                        className={`flex cursor-not-allowed items-center rounded-full font-sans text-[13px] font-medium text-white ${
                          plegada ? 'justify-center px-0 py-2.5' : 'gap-3 px-4 py-2.5'
                        }`}
                      >
                        {item.icon}
                        <span className={plegada ? 'sr-only' : 'flex-1'}>{item.label}</span>
                        {!plegada && (
                          <span className="font-sans text-[9px] uppercase tracking-wider text-white">
                            Pronto
                          </span>
                        )}
                      </span>
                    );
                  }

                  return (
                    /**
                     * 🔴 **`next/link`, y ese es el premio entero de la fusión.**
                     *
                     * Eran `<a>` duros por obligación: cada destino lo servía otra
                     * aplicación del multi-zone y el router habría prefijado la ruta con
                     * el `basePath` de la zona actual. El precio era que **cambiar de
                     * sección recargaba la página**: se remontaba el armazón, se volvía a
                     * pedir el directorio de chats y se cerraba y reabría la conexión SSE.
                     *
                     * Desde F8 las cinco secciones cuelgan del mismo layout, así que esto
                     * es navegación del router: la barra no parpadea y el flujo no se
                     * corta. ⚠️ Volver a poner un `<a>` aquí deshace la fusión sin que
                     * falle nada.
                     */
                    <Link
                      key={claveItem}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      title={plegada ? item.label : undefined}
                      className={[
                        'relative flex items-center rounded-full font-sans text-[13px] transition-colors duration-150',
                        plegada ? 'justify-center px-0 py-2.5' : 'gap-3 px-4 py-2.5',
                        active
                          ? 'font-semibold text-white bg-white/10 hover:bg-white/15'
                          : 'font-medium text-white hover:bg-white/5 hover:text-white',
                      ].join(' ')}
                    >
                      {item.icon}
                      <span className={plegada ? 'sr-only' : 'flex-1'}>{item.label}</span>

                      {/* Sin no leídos no hay insignia: un cero no informa de nada. */}
                      {item.badge !== undefined &&
                        item.badge > 0 &&
                        (plegada ? (
                          /* Plegada, la insignia no cabe al lado: se convierte en un punto
                           sobre la esquina del icono. El número se pierde a propósito
                           —no cabe legible en 8 px— pero el hecho de que haya algo sin
                           leer es justo lo que no se puede perder al plegar. */
                          <span
                            aria-label={`${item.badge} sin leer`}
                            className="absolute right-2 top-2 h-2 w-2 rounded-full ring-2"
                            style={{
                              background: colors.primary,
                              ['--tw-ring-color' as string]: colors.surface,
                            }}
                          />
                        ) : (
                          <span
                            aria-label={`${item.badge} sin leer`}
                            className="min-w-5 rounded-full px-1.5 py-0.5 text-center font-sans text-[10px] font-semibold tabular-nums"
                            style={{ background: colors.primary, color: colors.primaryForeground }}
                          >
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        ))}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
