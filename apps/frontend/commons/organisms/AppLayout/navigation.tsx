import type { ReactNode } from 'react';
import { PraxSidebarIcon } from '../../atoms/PraxAvatar';

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
  /**
   * El grupo al que pertenece, con la etiqueta ya en español — `NavList` la
   * pinta tal cual encima de la primera entrada de cada grupo nuevo. Items
   * consecutivos con la misma `section` no repiten la etiqueta.
   */
  section: string;
}

const SECTION_PRINCIPAL = 'Principal';
/** Exportada: `commons/auth/nav.ts` la usa para esconder el grupo entero a
 * quien no administra, en vez de comparar tres `href` sueltos. */
export const SECTION_ADMINISTRACION = 'Administración';
const SECTION_CONFIGURACION = 'Configuración';

/**
 * `aria-hidden` va escrito en cada `<svg>` y no aquí: son iconos decorativos
 * junto a una etiqueta de texto, así que ocultarlos al lector de pantalla es lo
 * correcto — pero dentro de un spread el linter de accesibilidad no lo ve y
 * reclama un `<title>` que sobra.
 *
 * Los iconos de varios trazos van envueltos en un `<g>` para que el `<svg>`
 * tenga un solo hijo — buena higiene, aunque no basta para el aviso de claves
 * de desarrollo que documenta `NavList`.
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
    label: 'Proyectos',
    href: '/projects',
    section: SECTION_PRINCIPAL,
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

  /* «Análisis» (`/reports`) se retiró del sidebar: la pantalla de análisis no
     daba valor y está pendiente decidir qué hacer con esa zona. El código de
     `reports-front` sigue ahí, solo que ya no se enlaza desde la navegación. */
  
  /*
   * 🕳️ Aquí estaba «Suscripción» → `/billing`.
   *
   * Se quitó de la barra lateral: el plan es de la organización activa, así que
   * su sitio es el portal de la organización («Plan y asientos», con su botón de
   * contratar que ahora abre Stripe directo). La tabla comparativa
   * (`/billing`) **sigue existiendo** —la ruta no se toca— y se llega
   * por «Comparar los planes» desde ese portal y desde el aviso de cuota del
   * asistente. Una entrada de barra lateral para una tabla de precios era la
   * tercera de tres que hablaban de lo mismo.
   */
  {
    label: 'Facturación',
    href: '/billing',
    section: SECTION_PRINCIPAL,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    label: 'Integraciones',
    href: '/integraciones',
    section: SECTION_PRINCIPAL,
    disabled: true,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 3v4M15 3v4M6 7h12l-1 5a5 5 0 01-10 0L6 7zM9 21v-4M15 21v-4"
        />
      </svg>
    ),
  },

  /**
   * Administración de la plataforma, en cuatro pantallas — no una.
   *
   * ⚠️ **Las tres rutas ya existían** (`/admin`, `/admin/projects`,
   * `/admin/actividad`) pero solo la primera tenía entrada en la barra: las
   * otras dos eran alcanzables solo escribiendo la URL a mano, sin un solo
   * enlace real hacia ellas en ninguna pantalla. Esto no divide una pantalla
   * en tres, expone tres que ya estaban.
   *
   * `loadAppNavItems` descarta las tres a la vez si la cuenta no administra
   * (`commons/auth/nav.ts`) — esconderlas es cortesía, no seguridad: las
   * cuatro rutas de `/api/admin` exigen el rol en el gateway.
   */
  {
    label: 'Cuentas',
    href: '/admin',
    section: SECTION_ADMINISTRACION,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M11 8a3 3 0 11-6 0 3 3 0 016 0zm7 11v-1a3.5 3.5 0 00-2.5-3.36M14.5 7.13a3 3 0 010 5.74"
        />
      </svg>
    ),
  },
  {
    label: 'Proyectos',
    href: '/admin/projects',
    section: SECTION_ADMINISTRACION,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v1H4V6zM4 9h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2V9z"
        />
      </svg>
    ),
  },
  {
    /**
     * Las organizaciones de **toda la instalación**, no las tuyas.
     *
     * ⚠️ No se confunde con la entrada de Gestión: aquella abre las tuyas —donde
     * trabajas— y esta la lista completa de quién ha contratado qué. Son la
     * misma separación que «Proyectos» de Principal y «Proyectos» de
     * Administración, que ya conviven con el mismo nombre en dos grupos.
     */
    label: 'Organizaciones',
    href: '/admin/organizations',
    section: SECTION_ADMINISTRACION,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 20V7.5L11 4v16M11 20h9V10.5L11 7.5M7 9.5h1M7 13h1M7 16.5h1M14.5 13h1M14.5 16.5h1"
        />
      </svg>
    ),
  },
  {
    label: 'Actividad',
    href: '/admin/actividad',
    section: SECTION_ADMINISTRACION,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8v4l2.5 2.5M21 12a9 9 0 11-9-9 9 9 0 019 9z"
        />
      </svg>
    ),
  },

  {
    /**
     * Ajustes de la cuenta. Hoy solo tus datos —nombre y apellido, que el
     * registro no pide— y por eso **absorbió `/profile`** en vez de
     * enlazarla: una pantalla que solo llevara a otra es un salto de más.
     */
    label: 'Sistema',
    href: '/settings',
    section: SECTION_CONFIGURACION,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <g>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.3 4.3a1 1 0 011-.8h1.4a1 1 0 011 .8l.2 1.4a6.5 6.5 0 011.5.9l1.3-.5a1 1 0 011.2.4l.7 1.2a1 1 0 01-.2 1.3l-1.1.9a6.6 6.6 0 010 1.7l1.1.9a1 1 0 01.2 1.3l-.7 1.2a1 1 0 01-1.2.4l-1.3-.5a6.5 6.5 0 01-1.5.9l-.2 1.4a1 1 0 01-1 .8h-1.4a1 1 0 01-1-.8l-.2-1.4a6.5 6.5 0 01-1.5-.9l-1.3.5a1 1 0 01-1.2-.4l-.7-1.2a1 1 0 01.2-1.3l1.1-.9a6.6 6.6 0 010-1.7l-1.1-.9a1 1 0 01-.2-1.3l.7-1.2a1 1 0 011.2-.4l1.3.5a6.5 6.5 0 011.5-.9l.2-1.4z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.5 12a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
          />
        </g>
      </svg>
    ),
  },
  {
    label: 'Ayuda',
    href: '/ayuda',
    section: SECTION_CONFIGURACION,
    disabled: true,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-1.8 1.8-2.3 2.9-.1.3-.2.6-.2 1M12 17h.01M21 12a9 9 0 11-9-9 9 9 0 019 9z"
        />
      </svg>
    ),
  },
  {
    label: 'Soporte',
    href: '/soporte',
    section: SECTION_CONFIGURACION,
    disabled: true,
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 13v-1a8 8 0 0116 0v1M4 13v4a2 2 0 002 2h1v-6H5a1 1 0 00-1 1zm16 0v4a2 2 0 01-2 2h-1v-6h1a1 1 0 011 1z"
        />
      </svg>
    ),
  },
];
