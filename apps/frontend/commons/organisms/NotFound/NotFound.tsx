import { alpha, colors } from '../../tokens';

export interface NotFoundProps {
  /**
   * A dónde lleva el botón. Cada zona sabe cuál es su sitio: el panel para
   * quien ya entró, la portada para quien no.
   */
  href?: string;
  /** El texto del botón. Por defecto, «Volver al inicio». */
  hrefLabel?: string;
  /** Qué se ha perdido. Por defecto habla de una página. */
  descripcion?: string;
}

/**
 * La pantalla de «esto no existe».
 *
 * ## Por qué vive en commons
 *
 * En multi-zones **cada app tiene su propio 404**: el `not-found.tsx` de
 * projects-front atiende `/projects/loquesea`, el del shell atiende el resto, y
 * así seis veces. Sin una pieza común serían seis pantallas que se irían
 * pareciendo cada vez menos, y un 404 distinto según la ruta es justo lo que
 * hace pensar que algo se ha roto de verdad.
 *
 * ## El 404 va en Redaction, y no es un capricho
 *
 * `font-display` es la tipografía de titulares del sistema —Redaction—, así que
 * la cifra grande se lee como parte del producto y no como una plantilla
 * genérica. A ese tamaño se le ve el grano, que es su gracia.
 *
 * ⚠️ **Enlace con `<a>` y no con `next/link`.** Desde una zona con `basePath`,
 * `next/link` antepone su prefijo: un `/dashboard` escrito en projects-front
 * saldría como `/projects/dashboard`. Aquí siempre se va a *otra* zona o a la
 * raíz, así que la navegación dura es la correcta — y en una página de error, la
 * más fiable.
 */
export function NotFound({
  href = '/',
  hrefLabel = 'Volver al inicio',
  descripcion = 'La página que buscas no existe, o ya no está donde estaba.',
}: NotFoundProps) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center"
      style={{
        /* La misma retícula de puntos del lienzo de los tableros, con la sombra
           hacia dentro que hunde los bordes. Repetirla aquí hace que un 404 se
           sienta dentro de la aplicación y no en una página suelta del
           servidor. */
        backgroundColor: colors.background,
        backgroundImage: `radial-gradient(${alpha(colors.borderStrong, 55)} 1px, transparent 1px)`,
        backgroundSize: '22px 22px',
        backgroundPosition: '11px 11px',
        boxShadow: `inset 0 0 120px 40px ${alpha(colors.canvasShadow, 70)}`,
      }}
    >
      <p
        /* `leading-none` y `tabular-nums`: a este tamaño el interlineado por
           defecto abre un hueco enorme bajo la cifra, y las tres cifras tienen
           que ocupar lo mismo para que el 0 quede centrado de verdad. */
        className="select-none font-display text-[clamp(6rem,22vw,13rem)] font-bold leading-none tabular-nums"
        style={{ color: colors.textPrimary }}
        aria-hidden="true"
      >
        4<span style={{ color: colors.primary }}>0</span>4
      </p>

      <h1 className="mt-4 font-display text-2xl text-text-primary sm:text-3xl">Aquí no hay nada</h1>

      <p className="mt-3 max-w-md font-sans text-sm leading-relaxed text-white">
        {descripcion}
      </p>

      {/* Un `<a>` con pinta de botón, no el átomo `Button`: aquel es un
          componente de cliente y esta pantalla no necesita JavaScript para
          nada. Un 404 que depende de que cargue un bundle es un 404 que puede
          no llegar a pintarse. */}
      <a
        href={href}
        className="mt-8 inline-flex h-11 items-center justify-center rounded-lg px-6 font-sans text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        style={{ background: colors.primary, color: colors.primaryForeground }}
      >
        {hrefLabel}
      </a>
    </main>
  );
}
