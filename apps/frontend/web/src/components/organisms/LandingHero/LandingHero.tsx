'use client';

import { RollCta } from '@/components/molecules/RollCta';
import { l } from '@/lib/landingColors';
import type { CSSProperties, ElementType, ReactNode } from 'react';

export interface LandingHeroProps {
  isAuthenticated?: boolean;
}

/**
 * Reveal del hero — anima al montar, nunca al cruzar el viewport.
 *
 * `commons/molecules/Reveal` espera a un `IntersectionObserver`, que es lo
 * correcto para el resto de la página pero no para el hero: es lo primero
 * que se ve, y en una pantalla baja el bloque de CTA cae por debajo del
 * umbral de disparo en la carga inicial — se queda invisible hasta que
 * alguien hace scroll. Kyloo resuelve exactamente esto igual: su Hero
 * tampoco usa el sistema de reveal por scroll.
 */
function HeroReveal({
  as: Tag = 'span',
  delay = 0,
  className = '',
  innerClassName = '',
  style,
  children,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Tag className={`reveal-mask ${className}`}>
      <span
        className={`hero-reveal-inner block ${innerClassName}`}
        style={{ animationDelay: `${delay}s`, ...style }}
      >
        {children}
      </span>
    </Tag>
  );
}

/**
 * El desvanecido de las dos cursivas del titular.
 *
 * ## Qué es y por qué solo aquí
 *
 * Es la excepción de color que `kyloo-design/SKILL.md` §1 ya reservaba para el
 * titular del hero —«una sola concesión, y es la marca: identidad, no
 * decoración»—. Antes se cobraba en gris apagado; ahora se cobra en índigo, que
 * es lo que la ata al producto. No se generaliza: cualquier otra cursiva de la
 * página sigue en `--l-fg-muted`.
 *
 * El ángulo son 105°, no 90°: la letra es cursiva y sube hacia la derecha, así
 * que un degradado vertical la cruzaría a contrapelo.
 *
 * ## Las tres trampas de recortar un fondo contra el texto
 *
 * 1. ⚠️ **`WebkitTextFillColor` y NO `color: transparent`.** Es lo que deja un
 *    repliegue de verdad: `color` queda puesto en índigo liso, y solo lo tapa
 *    el navegador que además entiende `-webkit-text-fill-color` — que son
 *    exactamente los mismos que entienden `background-clip: text`. Con
 *    `color: transparent`, un navegador que no recortara el fondo pintaría el
 *    **titular invisible**, que es el peor fallo posible en la primera pantalla.
 * 2. ⚠️ **El prefijo `-webkit-` sigue haciendo falta.** Safari no aplica
 *    `background-clip: text` sin él, y su ausencia no da error: pinta el
 *    rectángulo del degradado entero por detrás de la palabra.
 * 3. ⚠️ **El fondo se dimensiona con la caja del `<span>`**, así que cada
 *    cursiva lleva su propio degradado completo en vez de un trozo de uno
 *    común. Es lo que se quiere —las dos se desvanecen igual, estén donde
 *    estén— pero significa que envolver las dos en un padre cambiaría el
 *    resultado sin que nada avise.
 */
const DEGRADADO_DE_MARCA: CSSProperties = {
  color: l.accent,
  backgroundImage: `linear-gradient(105deg, ${l.accentBright} 0%, ${l.accent} 48%, ${l.accentDeep} 100%)`,
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

export function LandingHero({ isAuthenticated = false }: LandingHeroProps) {
  return (
    <section
      className="relative flex min-h-screen flex-col justify-center overflow-hidden pt-16"
      style={{ background: l.bg, color: l.fg }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        {/**
         * 🚫 **Aquí había un vídeo, y era la mitad derecha del hero.**
         *
         * Cuatro planos de b-roll de escritorio en bucle, dentro de un marco
         * 4/5. Se retira: no enseñaba el producto —era metraje genérico de
         * gente en un portátil— y era lo único de toda la landing con imagen,
         * así que marcaba una diferencia con la aplicación que no compensaba
         * nada. También se lleva su coste: cuatro `.webm`, cuatro `.mp4` y
         * cuatro pósters cargando en la primera pantalla.
         *
         * ⚠️ **Y el bloque se CENTRA, no se queda alineado a la izquierda.**
         *
         * Primer intento: quitar el vídeo y dejar el texto donde estaba. Se veía
         * mal, y con razón — el titular estaba compuesto para ser la mitad
         * izquierda de una balanza, así que solo pesaba de un lado y la mitad
         * derecha de la pantalla quedaba vacía sin nada que la justificara. Un
         * hero de una sola columna no tiene contrapeso que colocar: el eje es el
         * centro.
         *
         * ⚠️ **La medida es `max-w-5xl`, y el primer intento se quedó corto.**
         *
         * Con `max-w-4xl` el titular cabía en cuatro renglones cortos y el
         * bloque entero se leía apretado en mitad de la pantalla: una columna
         * estrecha con dos márgenes enormes a los lados que no sostenían nada.
         * Centrar reduce el ancho útil —hay que acotar la línea para que se
         * pueda seguir— pero eso no es licencia para encogerlo hasta que parezca
         * que falta contenido.
         *
         * Lo que arregla el apretujamiento son las **dos** cosas a la vez: más
         * medida y más cuerpo. Un titular que crece con la caja la llena; uno
         * que se queda a 72 px dentro de una caja más ancha solo añade vacío.
         */}
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 text-center md:gap-10">
          {/* El mismo punto de acento que abre las cinco secciones de abajo
                (`SectionEyebrow`), aquí a mano: el hero no anima con `Reveal`
                —espera a un `IntersectionObserver` y en una pantalla baja el
                bloque se queda invisible—, así que reusar el componente
                traería justo el comportamiento que `HeroReveal` viene a
                evitar. Lo que se comparte es el dibujo, no el motor. */}
          <HeroReveal
            className="w-fit"
            innerClassName="flex items-center gap-2.5 font-mono text-xs font-medium uppercase tracking-widest"
            style={{ color: l.fgMuted }}
          >
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 flex-none"
              style={{ background: l.accent }}
            />
            Gestión de proyectos · Automatización · IA
          </HeroReveal>

          {/* Titular. Las dos cursivas llevan el desvanecido de marca
              (`DEGRADADO_DE_MARCA`); el resto se queda en blanco hueso. La
              emoción la sigue poniendo la cursiva de Fraunces — el índigo solo
              dice de quién es esto. */}
          <h1
            /**
             * ⚠️ **Los cuerpos están calibrados contra la línea larga, medidos.**
             *
             * La línea que manda es «para la gestión súper inteligente», y su
             * ancho **no escala linealmente con el cuerpo**: Fraunces es
             * variable y estrecha la letra al crecer. Medido con `nowrap` sobre
             * el renglón real:
             *
             * | Cuerpo | Ancho |
             * |---|---|
             * | 56 px | 746 px |
             * | 72 px | 919 px |
             * | 80 px | 964 px |
             * | 84 px | 980 px |
             *
             * La columna disponible es `min(1024, ventana − 48)`, así que:
             *
             * | Ventana | Columna | Cuerpo | Necesita | Holgura |
             * |---|---|---|---|---|
             * | 768 (md) | 720 px | 52 px | ~693 px | 27 px |
             * | 1024 (lg) | 976 px | 76 px | ~942 px | 34 px |
             *
             * ⚠️ **84 px se partía justo en 1024** —la columna se queda en 976 y
             * la línea pide 980—, o sea que el titular se rompía a cuatro
             * renglones exactamente en el portátil más común. Por **cuatro
             * píxeles**. Y 80 px dejaba 12, que es holgura de nada: cualquier
             * ajuste de copia o una versión distinta de la fuente lo rompe. De
             * ahí que estos números vengan de medir y no de mirar.
             *
             * Por debajo de `md` la línea larga sí parte, y está bien: en un
             * móvil no hay ancho que valga y partir es lo correcto.
             */
            className="text-4xl leading-[1.05] tracking-tight sm:text-5xl md:text-[3.25rem] lg:text-[4.75rem]"
            style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}
          >
            {/**
             * ⚠️ **«La» y «súper app» van en la MISMA línea**, y antes no.
             *
             * `HeroReveal` pinta su interior como `block`, así que «La» se
             * llevaba un renglón entero para sí sola. Alineado a la izquierda
             * pasaba por un arranque en bandera; centrado se lee como una
             * palabra huérfana flotando sobre el titular. Con las dos en
             * `inline-block` la primera línea tiene peso y el bloque hace pie.
             */}
            <span className="block">
              <HeroReveal
                delay={0}
                className="inline-block align-bottom"
                innerClassName="mr-3 md:mr-4"
              >
                La
              </HeroReveal>
              <HeroReveal
                delay={0.06}
                innerClassName="italic"
                className="inline-block align-bottom"
              >
                <span style={DEGRADADO_DE_MARCA}>súper app</span>
              </HeroReveal>
            </span>
            {/**
             * ⚠️ **Tres renglones, no cuatro** — y esto se midió antes de
             * tocarlo.
             *
             * Con cuatro, la línea más larga medía **584 px dentro de una
             * columna de 1024**: el titular ocupaba el 57 % de su propia caja y
             * el bloque entero se leía como una torre estrecha en mitad de la
             * pantalla. Eso es lo que se veía «apretado en el centro», y no se
             * arreglaba ensanchando la caja —el texto no crece con ella— ni
             * subiendo el cuerpo, porque cuatro renglones a más tamaño se
             * comen el alto de la primera pantalla.
             *
             * Juntar «para la gestión» con «súper inteligente» da una línea
             * larga que **ancla** el bloque: el titular pasa a llenar su
             * columna y además baja de alto, así que sobra aire arriba y abajo.
             */}
            <span className="block">
              <HeroReveal
                delay={0.12}
                className="inline-block align-bottom"
                innerClassName="mr-3 md:mr-4"
              >
                para la gestión
              </HeroReveal>
              <HeroReveal
                delay={0.18}
                className="inline-block align-bottom"
                innerClassName="italic"
              >
                <span style={DEGRADADO_DE_MARCA}>súper inteligente</span>
              </HeroReveal>
            </span>
            <HeroReveal delay={0.24} innerClassName="block">
              de tus proyectos.
            </HeroReveal>
          </h1>

          {/* Subtítulo */}
          <HeroReveal
            as="div"
            delay={0.3}
            className="w-full"
            innerClassName="mx-auto max-w-3xl text-balance font-sans text-lg leading-relaxed md:text-xl"
            style={{ color: l.fgMuted }}
          >
            Espacios, tableros y permisos por rol para organizar el trabajo, más{' '}
            <span style={{ color: l.fg, fontWeight: 600 }}>un asistente que propone</span> y{' '}
            <span style={{ color: l.fg, fontWeight: 600 }}>reglas que actúan solas</span> cuando
            algo cambia.
          </HeroReveal>

          {/* CTA */}
          <HeroReveal
            as="div"
            delay={0.36}
            innerClassName="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <RollCta
              size="lg"
              href={isAuthenticated ? '/projects' : '/auth/signup'}
              label={isAuthenticated ? 'Ir al panel' : 'Comenzar gratis'}
            />
            {!isAuthenticated && (
              <a href="/auth/login" className="font-sans text-sm underline underline-offset-4">
                Iniciar sesión
              </a>
            )}
          </HeroReveal>
        </div>
      </div>

      <style>{`
        .hero-reveal-inner {
          animation: hero-line-reveal 1.075s var(--ease-transition) both;
        }
        @keyframes hero-line-reveal {
          from { transform: translateY(150%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-reveal-inner { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
    </section>
  );
}
