'use client';

import { useState } from 'react';
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

  /* Los hijos entran en la misma comparación, aplanados: si no entraran,
     `/dashboard/billing` no encendería nada —su padre no es prefijo suyo— y la
     barra se quedaría sin ninguna entrada marcada estando dentro de una página
     real. Ganar por longitud sigue resolviendo el resto. */
  const todos = navItems.flatMap((item) => [item, ...(item.children ?? [])]);

  for (const item of todos) {
    if (item.disabled) continue;
    const matches = activePath === item.href || activePath.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }

  return best;
}

/** ¿Está el usuario dentro de alguna de las páginas de este grupo? */
function grupoActivo(grupo: AppNavItem, activeHref: string | null): boolean {
  return (grupo.children ?? []).some((hija) => hija.href === activeHref);
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
        if (item.children && item.children.length > 0) {
          /**
           * ⚠️ **Plegada, el grupo se deshace en sus hijas.** Un desplegable
           * dentro de un carril de 64 px no tiene dónde abrirse, y dejar solo al
           * padre —que no navega— sería una entrada que al pulsarla no hace
           * nada. Aplanarlo cuesta una fila de más y mantiene todo alcanzable.
           */
          if (plegada) {
            return item.children.map((hija) => (
              <Enlace
                key={hija.href}
                item={hija}
                activo={hija.href === activeHref}
                plegada
                onNavigate={onNavigate}
              />
            ));
          }

          return (
            <Grupo key={item.href} item={item} activeHref={activeHref} onNavigate={onNavigate} />
          );
        }

        if (item.disabled) return <Apagado key={item.href} item={item} plegada={plegada} />;

        return (
          <Enlace
            key={item.href}
            item={item}
            activo={item.href === activeHref}
            plegada={plegada}
            onNavigate={onNavigate}
          />
        );
      })}
    </nav>
  );
}

/**
 * Una entrada con páginas dentro.
 *
 * ## Se abre solo cuando estás dentro, y se puede cerrar
 *
 * El estado inicial no es «cerrado»: es **abierto si alguna de sus páginas es la
 * que estás viendo**. Al revés, entrar en Facturación desde cualquier sitio te
 * dejaría con la sección colapsada y sin ninguna entrada encendida — la barra
 * diría que no estás en ninguna parte.
 *
 * ⚠️ **El estado no se recuerda entre páginas, y es a propósito.** Cada
 * navegación de la barra lateral cruza zonas del multi-zone con un `<a>`, o sea
 * que monta el árbol de cero: guardarlo exigiría `localStorage` y una lectura
 * dentro de `try/catch` para algo que la regla de «abierto si estás dentro» ya
 * resuelve en el único caso que importa.
 */
function Grupo({
  item,
  activeHref,
  onNavigate,
}: {
  item: AppNavItem;
  activeHref: string | null;
  onNavigate?: (() => void) | undefined;
}) {
  const dentro = grupoActivo(item, activeHref);
  const [abierto, setAbierto] = useState(dentro);
  const listaId = `nav-grupo-${item.href.replace(/[^a-z0-9]+/gi, '-')}`;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setAbierto((estaba) => !estaba)}
        aria-expanded={abierto}
        aria-controls={listaId}
        className={[
          'flex items-center gap-3 rounded-lg px-4 py-3 font-sans text-sm transition-all duration-150',
          dentro
            ? 'font-semibold text-text-primary'
            : 'font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
        ].join(' ')}
        style={dentro ? { background: alpha(colors.primary, 8) } : undefined}
      >
        {item.icon}
        <span className="flex-1 text-left">{item.label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {abierto && (
        <ul id={listaId} className="flex flex-col gap-1">
          {item.children?.map((hija) => (
            <li key={hija.href} className="relative pl-5">
              {/* La guía vertical: es lo que hace que dos entradas indentadas se
                  lean como «dentro de» y no como dos entradas sueltas más
                  pequeñas. */}
              <span
                aria-hidden="true"
                className="absolute bottom-1 left-[1.35rem] top-1 w-px"
                style={{ background: colors.borderSubtle }}
              />
              <Enlace
                item={hija}
                activo={hija.href === activeHref}
                onNavigate={onNavigate}
                anidado
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Un enlace de la barra.
 *
 * `<a>` y no `next/link`: estos destinos los sirven otras zonas del multi-zone,
 * y el router prefijaría la ruta con el basePath de la zona actual. Ver
 * ESTADO-ACTUAL §16.
 */
function Enlace({
  item,
  activo,
  plegada = false,
  anidado = false,
  onNavigate,
}: {
  item: AppNavItem;
  activo: boolean;
  plegada?: boolean;
  /** Dentro de un grupo: más pequeño, sin sombra y con la guía a la izquierda. */
  anidado?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <a
      href={item.href}
      onClick={onNavigate}
      aria-current={activo ? 'page' : undefined}
      title={plegada ? item.label : undefined}
      className={[
        'relative flex items-center rounded-lg font-sans transition-all duration-150',
        plegada ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3',
        anidado ? 'py-2 text-[13px]' : 'text-sm',
        activo
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
      ].join(' ')}
      style={
        activo && !anidado ? { boxShadow: `0 8px 24px ${alpha(colors.primary, 20)}` } : undefined
      }
    >
      {item.icon}
      <span className={plegada ? 'sr-only' : 'flex-1'}>{item.label}</span>

      {/* Sin no leídos no hay insignia: un cero no informa de nada. */}
      {item.badge !== undefined && item.badge > 0 && (
        <Insignia cuantos={item.badge} activo={activo} plegada={plegada} />
      )}
    </a>
  );
}

function Insignia({
  cuantos,
  activo,
  plegada,
}: {
  cuantos: number;
  activo: boolean;
  plegada: boolean;
}) {
  if (plegada) {
    /* Plegada, la insignia no cabe al lado: se convierte en un punto sobre la
       esquina del icono. El número se pierde a propósito —no cabe legible en
       8 px— pero el hecho de que haya algo sin leer es justo lo que no se puede
       perder al plegar. */
    return (
      <span
        aria-label={`${cuantos} sin leer`}
        className="absolute right-2 top-2 h-2 w-2 rounded-full ring-2"
        style={{
          background: activo ? colors.primaryForeground : colors.primary,
          // biome-ignore lint/style/useNamingConvention: propiedad CSS
          ['--tw-ring-color' as string]: colors.surface,
        }}
      />
    );
  }

  return (
    <span
      aria-label={`${cuantos} sin leer`}
      className="min-w-5 rounded-full px-1.5 py-0.5 text-center font-sans text-[11px] font-semibold tabular-nums"
      style={
        activo
          ? { background: alpha(colors.overlay, 30), color: colors.primaryForeground }
          : { background: colors.primary, color: colors.primaryForeground }
      }
    >
      {cuantos > 99 ? '99+' : cuantos}
    </span>
  );
}

/** Una entrada cuyo destino todavía no existe. Se ve, no navega. */
function Apagado({ item, plegada }: { item: AppNavItem; plegada: boolean }) {
  return (
    <span
      aria-disabled="true"
      title={plegada ? `${item.label} — disponible próximamente` : 'Disponible próximamente'}
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
