'use client';

/**
 * AuthPanel — el mismo dispositivo que el "Sobre el estudio" de Kyloo
 * (`AboutModal.tsx` en su repo): un panel a la derecha sobre un fondo
 * ambiental, con "Cerrar" + `esc` para volver. Adaptado para login/registro,
 * con una diferencia de fondo: allá es un modal que se abre encima de la
 * página sin navegar (viven en la misma app); aquí `/auth/*` es una zona
 * aparte de Multi-Zones — cruzar hacia `/` siempre es una navegación
 * completa, así que no hay "página de detrás" que enseñar, y por lo mismo
 * el panel no anima su entrada: no está entrando sobre nada, es la página.
 * Todo enlace de vuelta a `/` usa `<a href>` en vez de `next/link` — cruzar
 * de zona exige navegación dura, `next/link` intentaría resolverlo contra
 * el propio router de esta app, que no tiene esa ruta.
 *
 * El panel usa `.landing-light.cold` (`kyloo-design/SKILL.md` §2), la
 * variante fría de la paleta: blanco de verdad y grises neutros, sin el
 * beige cálido de las secciones editoriales de la landing — aquí no hay
 * texto de apoyo alrededor que lo sostenga, y se leía sucio.
 *
 * Ver kyloo-design/SKILL.md §12.
 */

import { KylooWordmark } from '@praxis/commons';
import { useEffect } from 'react';

/**
 * El desvanecido de los bordes de la pieza, copiado literal de `LandingHero`.
 *
 * ⚠️ **Se copia y NO se importa.** `LandingHero` es un organismo de la landing
 * y esto es el panel de acceso: importar desde ahí ataría una pantalla a la
 * otra por una cadena de CSS. Si esto se usa en un tercer sitio, entonces sí
 * sube a `commons` — la regla de siempre, dos usos es coincidencia y tres es
 * un patrón.
 */
const MASCARA_DE_BORDE =
  'radial-gradient(ellipse 50% 50% at 50% 46%, #000 0%, #000 34%, rgba(0,0,0,0.82) 52%, rgba(0,0,0,0.42) 66%, rgba(0,0,0,0.12) 80%, transparent 94%)';

export interface AuthPanelProps {
  children: React.ReactNode;
}

export function AuthPanel({ children }: AuthPanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.location.assign('/');
    };
    // Fase de captura: si algo entre medias detiene la propagación en la
    // fase de burbuja (un dropdown de autocompletar del navegador sobre un
    // campo de contraseña, por ejemplo), esto se ejecuta antes igualmente.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Fondo ambiental — el mismo motivo halftone del cierre de la
          landing (PublicFooter), sin ningún dato real detrás porque no lo
          hay: es un ambiente, no una vista previa de la página que se
          dejó. */}
      <div
        className="landing relative hidden flex-1 flex-col justify-end overflow-hidden p-10 md:flex"
        style={{ background: 'var(--l-bg)' }}
      >
        {/**
         * La misma pieza que la primera pantalla de la landing
         * (`LandingHero`, `BloomVisual`) — y por las mismas razones, así que
         * las trampas están contadas allí, no aquí:
         *
         * - `mixBlendMode: 'lighten'` y **no** `screen`, porque el negro que
         *   devuelve el decodificador de vídeo no es exactamente el de la
         *   página y `screen` los suma.
         * - Ningún ancestro con `transform`, `filter` ni `opacity` < 1: abren
         *   contexto de apilado y el blend deja de ver el fondo.
         * - El radio de la máscara no pasa del 50 %, o el desvanecido muere
         *   fuera del elemento y reaparece el canto.
         *
         * 🚫 **Aquí había un `ShaderCanvas`** — el motivo halftone del cierre
         * de la landing, blanco sobre negro. Se retira: era el único sitio
         * donde la puerta de entrada enseñaba algo que no vuelve a aparecer
         * dentro del producto, y además su blanco impedía que esta pieza
         * conviviera con él (con `lighten`, el shader gana en cuanto pasa de
         * gris medio y la flor desaparece). El componente sigue existiendo y
         * lo usa `PublicFooter`.
         *
         * ⚠️ **El cuadrado se dimensiona con `min()` de las dos medidas del
         * panel, no con un porcentaje.** La columna es `flex-1` de alto
         * completo: su proporción va de casi cuadrada a muy apaisada según la
         * ventana, y un `w-[70%]` se sale por arriba en cuanto la ventana es
         * baja.
         */}
        <video
          className="pointer-events-none absolute top-1/2 left-1/2 aspect-square max-w-none -translate-x-1/2 -translate-y-1/2 object-cover"
          style={{
            width: 'min(96%, 82vh)',
            mixBlendMode: 'lighten',
            maskImage: MASCARA_DE_BORDE,
            WebkitMaskImage: MASCARA_DE_BORDE,
          }}
          src="/media/hero-bloom.mp4"
          poster="/media/hero-bloom.png"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          /**
           * ⚠️ **`aria-hidden` y `tabIndex={-1}` van juntos, siempre.** Un
           * `<video>` es enfocable, así que esconderlo del árbol de
           * accesibilidad sin sacarlo del orden de tabulación deja una parada
           * de teclado que no anuncia nada: se tabula, el foco desaparece y no
           * hay forma de saber dónde está. Biome lo marca
           * (`noAriaHiddenOnFocusable`) y su arreglo automático es el
           * contrario —quitar `aria-hidden`—, que sería anunciar un adorno.
           */
          tabIndex={-1}
          aria-hidden="true"
        />
        <a href="/" className="relative z-10 flex flex-col items-start gap-1.5 no-underline">
          <span
            className="text-5xl leading-none tracking-tight"
            style={{ fontFamily: 'var(--font-grotesk)', fontWeight: 800, color: 'var(--l-fg)' }}
          >
            Praxis
          </span>
          <span className="flex items-center gap-2" style={{ color: 'var(--l-fg)' }}>
            <span className="font-mono text-1xl uppercase tracking-[0.1em]">By</span>
            <KylooWordmark className="h-7 w-auto" />
          </span>
        </a>
      </div>

      {/* El panel */}
      <div
        className="landing-light cold relative flex h-full w-full flex-col overflow-y-auto md:w-[720px] md:max-w-full md:flex-none"
        style={{ background: 'var(--l-bg)', color: 'var(--l-fg)' }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 pt-6 pb-4 md:px-12 md:pt-10"
          style={{ background: 'var(--l-bg)' }}
        >
          <a
            href="/"
            className="text-lg tracking-tight no-underline"
            style={{ fontFamily: 'var(--font-grotesk)', fontWeight: 700, color: 'var(--l-fg)' }}
          >
            Praxis
          </a>

          <a
            href="/"
            className="flex items-center gap-2 rounded-[0.35rem] py-1.5 pr-1.5 pl-3 no-underline"
            style={{ background: 'var(--l-fg)', color: 'var(--l-bg)' }}
          >
            <span className="font-sans text-sm font-medium">Cerrar</span>
            <span
              className="rounded-[0.2rem] px-1.5 py-1 font-mono text-[0.6rem] uppercase"
              style={{ background: 'var(--l-card)', color: 'var(--l-fg-muted)' }}
            >
              esc
            </span>
          </a>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 md:px-12">
          {children}
        </div>
      </div>
    </div>
  );
}
