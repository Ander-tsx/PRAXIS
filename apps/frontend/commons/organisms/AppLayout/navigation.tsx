import type { ReactNode } from 'react';

/**
 * Un enlace de la barra lateral del área privada.
 *
 * `href` es siempre una ruta **del shell**, sin el basePath de ninguna zona:
 * la barra lateral cruza zonas, así que sus enlaces son navegación dura
 * (`<a>`), no `next/link`. Ver ESTADO-ACTUAL §16.
 */
export interface AppNavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /**
   * El destino todavía no existe. Se muestra apagado y no navega, para que la
   * estructura del producto se entienda sin prometer una pantalla que daría
   * 404.
   */
  disabled?: boolean;
  /**
   * Número a la derecha del enlace.
   *
   * Solo lo usa «Avisos», y solo cuando hay alguno sin leer: una insignia que
   * enseña un cero es una insignia que enseña nada. Quien monta el layout lo
   * pasa; la lista canónica no sabe contar.
   */
  badge?: number;
}

/**
 * `aria-hidden` va escrito en cada `<svg>` y no aquí: son iconos decorativos
 * junto a una etiqueta de texto, así que ocultarlos al lector de pantalla es lo
 * correcto — pero dentro de un spread el linter de accesibilidad no lo ve y
 * reclama un `<title>` que sobra.
 */
const iconProps = {
  className: 'h-5 w-5 shrink-0',
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.75,
} as const;

/**
 * Navegación canónica del área privada.
 *
 * Vive aquí, junto a `AppLayout`, para que las zonas no la vayan copiando y
 * divergiendo. Se pasa como prop igualmente: una zona puede filtrarla o
 * sustituirla si lo necesita.
 */
export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    label: 'Panel',
    href: '/dashboard',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"
        />
      </svg>
    ),
  },
  {
    label: 'Proyectos',
    href: '/projects',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
        />
      </svg>
    ),
  },
  {
    label: 'Análisis',
    href: '/reports',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    /* Estuvo apagado con «Pronto» desde el principio porque no había backend.
       Ya lo hay: reports-service en el 3005 y la zona en el 4104. */
  },
  {
    label: 'Notificaciones',
    href: '/dashboard/notifications',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
    ),
  },
  {
    /**
     * El panel de administración de la plataforma.
     *
     * ⚠️ **No sale para todo el mundo.** `loadAppNavItems` la descarta si la
     * cuenta no tiene rol de administración, y por eso la lista canónica la trae
     * y el filtro vive allí: aquí no hay forma de saber quién está mirando.
     *
     * Esconderla es **cortesía, no seguridad**: quien escriba `/admin` a mano
     * llega a una pantalla que se lo explica, y las cuatro rutas de
     * `/api/admin` exigen el rol en el gateway. Si esta línea se colara para
     * todos, el resultado sería una entrada que no lleva a ninguna parte, no una
     * fuga.
     *
     * Va antes de Configuración porque Configuración es siempre la última.
     */
    label: 'Administración',
    href: '/admin',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
        />
      </svg>
    ),
  },
  {
    /**
     * Ajustes de la cuenta. Hoy solo tus datos —nombre y apellido, que el
     * registro no pide— y por eso **absorbió `/dashboard/profile`** en vez de
     * enlazarla: una pantalla que solo llevara a otra es un salto de más.
     *
     * Va la última a propósito: es la entrada a la que se vuelve de vez en
     * cuando, no una por la que se pasa a diario.
     */
    label: 'Configuración',
    href: '/dashboard/settings',
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.3 4.3a1 1 0 011-.8h1.4a1 1 0 011 .8l.2 1.4a6.5 6.5 0 011.5.9l1.3-.5a1 1 0 011.2.4l.7 1.2a1 1 0 01-.2 1.3l-1.1.9a6.6 6.6 0 010 1.7l1.1.9a1 1 0 01.2 1.3l-.7 1.2a1 1 0 01-1.2.4l-1.3-.5a6.5 6.5 0 01-1.5.9l-.2 1.4a1 1 0 01-1 .8h-1.4a1 1 0 01-1-.8l-.2-1.4a6.5 6.5 0 01-1.5-.9l-1.3.5a1 1 0 01-1.2-.4l-.7-1.2a1 1 0 01.2-1.3l1.1-.9a6.6 6.6 0 010-1.7l-1.1-.9a1 1 0 01-.2-1.3l.7-1.2a1 1 0 011.2-.4l1.3.5a6.5 6.5 0 011.5-.9l.2-1.4z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 12a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
      </svg>
    ),
  },
];
