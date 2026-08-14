'use client';

import { alpha, colors } from '../../tokens';
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
   * visualmente al plegar.
   */
  plegada?: boolean;
}) {
  const activeHref = activeHrefOf(activePath, navItems);

  return (
    <nav className="flex flex-col gap-1.5" aria-label="Secciones">
      {navItems.map((item) => {
        const active = !item.disabled && item.href === activeHref;

        if (item.disabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title={
                plegada ? `${item.label} — disponible próximamente` : 'Disponible próximamente'
              }
              className={`flex cursor-not-allowed items-center rounded-lg font-sans text-sm font-medium text-text-disabled ${
                plegada ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'
              }`}
            >
              {item.icon}
              <span className={plegada ? 'sr-only' : 'flex-1'}>{item.label}</span>
              {!plegada && (
                <span className="font-sans text-[10px] uppercase tracking-wider text-text-disabled">
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
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={plegada ? item.label : undefined}
            className={[
              'relative flex items-center rounded-lg font-sans text-sm transition-all duration-150',
              plegada ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3',
              active
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
            ].join(' ')}
            style={active ? { boxShadow: `0 8px 24px ${alpha(colors.primary, 20)}` } : undefined}
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
                    background: active ? colors.primaryForeground : colors.primary,
                    // biome-ignore lint/style/useNamingConvention: propiedad CSS
                    ['--tw-ring-color' as string]: colors.surface,
                  }}
                />
              ) : (
                <span
                  aria-label={`${item.badge} sin leer`}
                  className="min-w-5 rounded-full px-1.5 py-0.5 text-center font-sans text-[11px] font-semibold tabular-nums"
                  style={
                    active
                      ? { background: alpha(colors.overlay, 30), color: colors.primaryForeground }
                      : { background: colors.primary, color: colors.primaryForeground }
                  }
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ))}
          </a>
        );
      })}
    </nav>
  );
}
