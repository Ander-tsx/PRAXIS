'use client';

import { useState } from 'react';
import { colors } from '../../tokens';
import type { AppNavItem } from './navigation';

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
   * Qué grupos están compactados, por `clave`. Vacío al montar — todos
   * abiertos — y el estado no se guarda entre visitas: es una comodidad de
   * la sesión, no una preferencia que necesite sobrevivir a un `F5`.
   */
  const [compactados, setCompactados] = useState<Set<string>>(() => new Set());

  function alternar(clave: string) {
    setCompactados((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) {
        siguiente.delete(clave);
      } else {
        siguiente.add(clave);
      }
      return siguiente;
    });
  }

  return (
    <nav className="flex flex-col gap-4" aria-label="Secciones">
      {grupos.map((grupo, indice) => {
        const compactado = !plegada && compactados.has(grupo.clave);

        return (
          <div key={grupo.clave} className="flex flex-col gap-1">
            {indice > 0 && (
              <div
                className={
                  plegada ? 'mx-1 mb-1 border-t border-border' : 'mb-1 border-t border-border'
                }
                aria-hidden="true"
              />
            )}
            {!plegada && (
              <button
                type="button"
                onClick={() => alternar(grupo.clave)}
                aria-expanded={!compactado}
                className="group/section mx-1 flex items-center justify-between gap-2 rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-white/60 transition-colors hover:text-white"
              >
                {grupo.section}
                <svg
                  className={`h-3.5 w-3.5 shrink-0 text-text-disabled transition-transform duration-200 ease-out group-hover/section:text-text-secondary ${
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
                  const claveItem = `${grupo.clave}::${item.href}`;

                  if (item.disabled) {
                    return (
                      <span
                        key={`${grupo.clave}-${idx}`}
                        aria-disabled="true"
                        title={
                          plegada
                            ? `${item.label} — disponible próximamente`
                            : 'Disponible próximamente'
                        }
                        className={`flex cursor-not-allowed items-center rounded-full font-sans text-[13px] font-medium text-text-disabled ${
                          plegada ? 'justify-center px-0 py-2.5' : 'gap-3 px-4 py-2.5'
                        }`}
                      >
                        {item.icon}
                        <span className={plegada ? 'sr-only' : 'flex-1'}>{item.label}</span>
                        {!plegada && (
                          <span className="font-sans text-[9px] uppercase tracking-wider text-text-disabled">
                            Pronto
                          </span>
                        )}
                      </span>
                    );
                  }

                  return (
                    /**
                     * `<a>` y no `next/link`: estos destinos los sirven otras zonas del
                     * multi-zone, y el router prefijaría la ruta con el basePath de la
                     * zona actual. Ver ESTADO-ACTUAL §16.
                     */
                    <a
                      key={`${grupo.clave}-${idx}`}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      title={plegada ? item.label : undefined}
                      className={[
                        'relative flex items-center rounded-full font-sans text-[13px] transition-colors duration-150',
                        plegada ? 'justify-center px-0 py-2.5' : 'gap-3 px-4 py-2.5',
                        active
                          ? 'font-semibold text-white bg-white/10 hover:bg-white/15'
                          : 'font-medium text-white/80 hover:bg-white/5 hover:text-white',
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
                    </a>
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
