/**
 * Los iconos del panel, en un sitio.
 *
 * Estaban repartidos por los organismos, y el mismo concepto se dibujaba
 * distinto en cada uno: el de «proyectos» de las métricas no era el de la barra
 * lateral. Aquí no hay lógica ninguna, solo trazados.
 *
 * ⚠️ **`aria-hidden` va escrito en cada `<svg>` y no dentro del spread.** Son
 * decorativos —siempre acompañan a una etiqueta de texto— pero metido en
 * `{...props}` el linter de accesibilidad no lo ve y reclama un `<title>` que
 * sobra. Ya pasó en tres archivos de esta zona.
 */

const base = {
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

type IconProps = { className?: string };

/** Reloj con la aguja pasada: la fecha ya venció. */
export function IconOverdue({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Campana: todavía hay tiempo, pero conviene mirarlo. */
export function IconSoon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

/** Lista con marcas: el trabajo que tienes encima. */
export function IconOpenWork({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 7h11M4 12h11M4 17h7" />
      <path d="M18.5 15.5l1.6 1.6L23 14" />
    </svg>
  );
}

/** Sobre: la bandeja de avisos. */
export function IconInbox({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7.5l7.4 5a2 2 0 002.2 0l7.4-5" />
    </svg>
  );
}

/** Carpeta con pestaña: proyectos. */
export function IconProjects({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.5 7.5A2 2 0 015.5 5.5h3.2a2 2 0 011.5.7l1 1.3h7.3a2 2 0 012 2v7.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
    </svg>
  );
}

/** Barras: la sección de Análisis. */
export function IconAnalysis({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 20V13M9.3 20V7M14.7 20v-4.5M20 20V4" />
    </svg>
  );
}

/** Bocadillo: los mensajes. */
export function IconChat({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M21 12c0 4.4-4 8-9 8a9.9 9.9 0 01-4.2-.9L3 21l1.4-4.2A7.9 7.9 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
    </svg>
  );
}

/** Rueda dentada: la configuración. */
export function IconSettings({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M10.3 4.3a1 1 0 011-.8h1.4a1 1 0 011 .8l.2 1.4a6.5 6.5 0 011.5.9l1.3-.5a1 1 0 011.2.4l.7 1.2a1 1 0 01-.2 1.3l-1.1.9a6.6 6.6 0 010 1.7l1.1.9a1 1 0 01.2 1.3l-.7 1.2a1 1 0 01-1.2.4l-1.3-.5a6.5 6.5 0 01-1.5.9l-.2 1.4a1 1 0 01-1 .8h-1.4a1 1 0 01-1-.8l-.2-1.4a6.5 6.5 0 01-1.5-.9l-1.3.5a1 1 0 01-1.2-.4l-.7-1.2a1 1 0 01.2-1.3l1.1-.9a6.6 6.6 0 010-1.7l-1.1-.9a1 1 0 01-.2-1.3l.7-1.2a1 1 0 011.2-.4l1.3.5a6.5 6.5 0 011.5-.9z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

/** Escudo con marca: el panel de administración. */
export function IconAdmin({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 3.5l7 2.5v5.2c0 4.2-2.9 7.6-7 8.8-4.1-1.2-7-4.6-7-8.8V6z" />
      <path d="M9.2 12l2 2 3.6-3.8" />
    </svg>
  );
}
