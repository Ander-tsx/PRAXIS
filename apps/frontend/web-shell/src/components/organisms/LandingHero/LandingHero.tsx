'use client';

import { RollCta } from '@/components/molecules/RollCta';
import { l, lRadius } from '@/lib/landingColors';
import { type CSSProperties, type ElementType, type ReactNode, useRef, useState } from 'react';

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

/** Cuatro planos cortos en vez de uno solo en bucle — b-roll de escritorio,
 * sin diálogo ni audio. Cuando uno termina entra el siguiente; con cuatro
 * planos distintos el bucle se nota mucho menos que con uno repitiéndose
 * cada dos segundos. */
const HERO_CLIPS = [1, 2, 3, 4].map((n) => ({
  webm: `/videos/hero-${n}.webm`,
  mp4: `/videos/hero-${n}.mp4`,
  poster: `/videos/hero-${n}-poster.jpg`,
}));

function HeroVideo() {
  const [index, setIndex] = useState(0);
  const clip = HERO_CLIPS[index];
  const nextTimer = useRef<number | undefined>(undefined);

  return (
    <video
      key={index}
      className="h-full w-full object-cover"
      style={{ filter: 'grayscale(0.15) contrast(1.05)' }}
      poster={clip.poster}
      autoPlay
      muted
      playsInline
      tabIndex={-1}
      aria-hidden="true"
      onEnded={() => {
        // El `poster` del siguiente clip se ve al instante (comportamiento
        // nativo del navegador, no depende de que decodifique el vídeo), así
        // que no hace falta un cruce en opacidad para disimular el cambio.
        window.clearTimeout(nextTimer.current);
        nextTimer.current = window.setTimeout(() => {
          setIndex((i) => (i + 1) % HERO_CLIPS.length);
        }, 80);
      }}
    >
      <source src={clip.webm} type="video/webm" />
      <source src={clip.mp4} type="video/mp4" />
    </video>
  );
}

export function LandingHero({ isAuthenticated = false }: LandingHeroProps) {
  return (
    <section
      className="relative flex min-h-screen flex-col justify-center overflow-hidden pt-24"
      style={{ background: l.bg, color: l.fg }}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          {/* Izquierda: eyebrow + titular + subtítulo + CTA */}
          <div className="flex flex-col items-start gap-7">
            <HeroReveal
              className="w-fit"
              innerClassName="font-mono text-xs font-medium uppercase tracking-widest"
              style={{ color: l.fgMuted }}
            >
              Gestión de proyectos · Automatización · IA
            </HeroReveal>

            {/* Titular. Sin degradado de color: la landing es monocroma de
                punta a punta. La emoción va en la cursiva de Fraunces, no
                en un color de marca. */}
            <h1
              className="text-5xl leading-[1.05] tracking-tight md:text-6xl lg:text-7xl"
              style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}
            >
              <span className="block">
                <HeroReveal delay={0} innerClassName="mr-3 md:mr-4">
                  La
                </HeroReveal>
                <HeroReveal
                  delay={0.06}
                  innerClassName="italic"
                  className="inline-block align-bottom"
                >
                  <span style={{ color: l.fgMuted }}>súper app</span>
                </HeroReveal>
              </span>
              <HeroReveal delay={0.12} innerClassName="block">
                para la gestión
              </HeroReveal>
              <HeroReveal delay={0.18} innerClassName="block italic">
                <span style={{ color: l.fgMuted }}>súper inteligente</span>
              </HeroReveal>
              <HeroReveal delay={0.24} innerClassName="block">
                de tus proyectos.
              </HeroReveal>
            </h1>

            {/* Subtítulo */}
            <HeroReveal
              as="div"
              delay={0.3}
              innerClassName="font-sans text-lg md:text-xl max-w-lg leading-relaxed"
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
              innerClassName="flex flex-col gap-4 sm:flex-row sm:items-center"
            >
              <RollCta
                size="lg"
                href={isAuthenticated ? '/dashboard' : '/auth/signup'}
                label={isAuthenticated ? 'Ir al panel' : 'Comenzar gratis'}
              />
              {!isAuthenticated && (
                <a href="/auth/login" className="font-sans text-sm underline underline-offset-4">
                  Iniciar sesión
                </a>
              )}
            </HeroReveal>
          </div>

          {/* Derecha: vídeo — el único elemento con imagen de todo el hero. */}
          <HeroReveal
            as="div"
            delay={0.2}
            className="hidden lg:block"
            innerClassName="block h-full w-full"
          >
            <div
              className="relative aspect-[4/5] w-full overflow-hidden"
              style={{ borderRadius: lRadius, border: `1px solid ${l.border}` }}
            >
              <HeroVideo />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ boxShadow: `inset 0 0 0 1px ${l.border}` }}
              />
            </div>
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
