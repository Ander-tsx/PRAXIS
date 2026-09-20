'use client';

import { l, lRadius } from '@/lib/landingColors';
import { useEffect, useRef, useState } from 'react';

export interface LandingDemoProps {
  /**
   * La fuente WebM (VP9), relativa a `public/`. Va primero: mismo contenido,
   * bastante menos peso, y el navegador que no lo entiende cae solo al `src`.
   */
  webmSrc?: string;
  /**
   * La fuente del vídeo, relativa a `public/`. Mientras no exista el archivo
   * se deja sin pasar y la sección se dibuja igual, con el marco vacío.
   */
  src?: string;
  /** El fotograma fijo, para lo que tarde en decodificar el vídeo. */
  poster?: string;
}

/**
 * LandingDemo — la demostración en vídeo, justo debajo del hero.
 *
 * ## Por qué asoma
 *
 * El marco **sube sobre el hero** con un margen negativo, de forma que su
 * borde superior entra en la primera pantalla sin hacer scroll. Es la única
 * razón de que esta sección exista como pieza aparte y no como un bloque más
 * de la página: un elemento cortado por el borde inferior de la ventana es la
 * señal más barata que hay de que abajo sigue habiendo algo. El hueco que
 * ocupa lo reserva el `pb` del hero — los dos números se leen juntos, y tocar
 * uno sin el otro deja el vídeo flotando o pisando el titular.
 *
 * 🚫 **Sin animación de entrada, y es deliberado.** Todo lo demás de esta
 * página aparece al cruzar el viewport (`Reveal`); aquí sería
 * contraproducente. El marco existe para verse cortado por el borde inferior
 * **antes** de que nadie haya hecho scroll, y una pieza que solo aparece
 * cuando ya la has alcanzado no invita a alcanzarla.
 *
 * ## El vídeo todavía no existe
 *
 * `src` es opcional a propósito. Sin él se pinta el marco y un aviso corto
 * dentro, con la proporción exacta que tendrá el archivo: así el resto de la
 * página ya está compuesta contra el espacio definitivo y meter el vídeo no
 * mueve nada de lo que hay debajo.
 *
 * ⚠️ **La proporción la fija el contenedor, no el archivo.** `aspect-video`
 * (16/9) más `object-cover` significa que un vídeo con otra proporción se
 * recorta en vez de descuadrar la página. Es lo que se quiere: el diseño no
 * puede depender de cómo se exporte el metraje.
 *
 * ## Se reproduce solo, y por eso no lleva sonido
 *
 * `autoPlay` sin `muted` **no arranca** en ningún navegador actual: la
 * política de reproducción automática exige silencio, y el fallo es mudo —la
 * promesa de `play()` se rechaza y el vídeo se queda en el póster—. Si algún
 * día lleva voz, deja de poder reproducirse solo y necesita un botón.
 *
 * ⚠️ **Y solo arranca cuando entra en pantalla.** Un `autoPlay` a secas
 * empieza a decodificar con la página, o sea mientras alguien está leyendo el
 * hero: gasta batería y ancho de banda en algo que nadie está viendo, y en un
 * móvil eso se nota en el primer scroll. El `IntersectionObserver` lo arranca
 * al asomar y lo pausa al salir.
 *
 * ## El único control es reproducir/pausar
 *
 * Nada de barra de progreso, volumen ni pantalla completa: por eso no lleva
 * el atributo `controls` nativo, que trae los cuatro. El botón propio guarda
 * si la pausa fue manual (`pausadoAMano`) para que el `IntersectionObserver`
 * no reanude un vídeo que la persona paró a propósito al volver a hacer
 * scroll sobre él.
 */
export function LandingDemo({ webmSrc, src, poster }: LandingDemoProps) {
  const marco = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  /* Si quien mira lo pausó a mano, el observador deja de reactivarlo al
     hacer scroll: sin esto, salir y volver a entrar en pantalla reanudaba
     un vídeo que la persona había parado a propósito. */
  const pausadoAMano = useRef(false);
  const [enReproduccion, setEnReproduccion] = useState(false);

  useEffect(() => {
    const nodo = marco.current;
    if (!nodo) return;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        const v = video.current;
        if (!v) return;
        if (entrada.isIntersecting) {
          if (pausadoAMano.current) return;
          /* La promesa se rechaza si el navegador decide que no toca —pestaña
             en segundo plano, ahorro de datos—. No es un error que haya que
             propagar: el póster se queda puesto y la página funciona igual. */
          void v.play().catch(() => undefined);
        } else {
          v.pause();
        }
      },
      /**
       * 🔴 **Un umbral alto aquí no retrasa la animación: la impide.** Con
       * `0.25`, el marco tenía que enseñar 190 de sus 750 px para contar como
       * visible, y en la primera pantalla solo asoman unos 130 — que es el
       * punto entero de esta sección—. El observador no disparaba nunca hasta
       * que alguien hacía scroll, o sea justo al revés de lo que se quería:
       * la pieza que invita a bajar solo aparecía después de haber bajado.
       */
      { threshold: 0.01 },
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  const alternar = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      pausadoAMano.current = false;
      void v.play().catch(() => undefined);
    } else {
      pausadoAMano.current = true;
      v.pause();
    }
  };

  return (
    <section
      className="landing relative z-10 -mt-[clamp(1.5rem,4svh,3rem)] pb-24 md:pb-32"
      style={{ background: 'transparent' }}
      aria-label="Praxis en funcionamiento"
    >
      <div className="mx-auto w-full max-w-[96rem] px-6 sm:px-8 lg:px-10 xl:px-16">
        <div
          ref={marco}
          className="relative aspect-video w-full overflow-hidden"
          style={{
            /* El radio de la landing, al doble: es la pieza más grande de la
               página y el radio «casi cuadrado» de una fila se pierde a este
               tamaño. Sigue siendo el mismo token, no un número suelto. */
            borderRadius: `calc(${lRadius} * 3)`,
            background: l.card,
            border: `1px solid ${l.border}`,
            /* La sombra la proyecta el marco sobre el negro del hero, que es
               lo que termina de separarlo del fondo y hace que se lea como una
               pieza encima y no como un hueco recortado. */
            boxShadow: '0 40px 90px -30px rgba(0,0,0,0.9)',
          }}
        >
          {src ? (
            <>
              <video
                ref={video}
                className="h-full w-full object-cover"
                poster={poster}
                loop
                muted
                playsInline
                preload="metadata"
                onPlay={() => setEnReproduccion(true)}
                onPause={() => setEnReproduccion(false)}
              >
                {webmSrc ? <source src={webmSrc} type="video/webm" /> : null}
                <source src={src} type="video/mp4" />
              </video>
              {/* El único control que lleva: reproducir/pausar. Nada de
                  barra de progreso, volumen ni pantalla completa — el marco
                  es una demostración ambiental, no un reproductor. */}
              <button
                type="button"
                onClick={alternar}
                aria-label={enReproduccion ? 'Pausar el vídeo' : 'Reproducir el vídeo'}
                className="absolute bottom-4 left-4 flex h-9 w-9 items-center justify-center transition-opacity hover:opacity-100 md:opacity-70"
                style={{
                  borderRadius: '9999px',
                  background: 'rgba(0,0,0,0.55)',
                  border: `1px solid ${l.border}`,
                  color: l.fg,
                }}
              >
                {enReproduccion ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <rect x="3" y="2" width="3.5" height="12" fill="currentColor" />
                    <rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="M4 2L14 8L4 14Z" fill="currentColor" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            /* El hueco reservado. No es un error ni un cargador: es el marco
               definitivo esperando su contenido, y lo dice. */
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center"
              style={{ color: l.fgMuted }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5"
                style={{ background: l.accent }}
              />
              <span className="font-mono text-xs uppercase tracking-widest">
                Praxis en funcionamiento
              </span>
              <span className="font-sans text-sm">Vídeo de demostración, muy pronto.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
