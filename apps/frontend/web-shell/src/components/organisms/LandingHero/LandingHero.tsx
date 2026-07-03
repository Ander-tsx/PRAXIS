'use client';

import { Sparkle, StatItem } from '@praxis/commons';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import dynamic from 'next/dynamic';

import { useEffect, useRef } from 'react';
import { AsciiBackground } from './AsciiBackground';

/* Three.js must be client-side only */
const EchoDot3D = dynamic(() => import('./EchoDot3D').then((m) => ({ default: m.EchoDot3D })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center" style={{ width: 300, height: 340 }}>
      <div
        className="w-32 h-32 rounded-full animate-pulse"
        style={{ background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.2)' }}
      />
    </div>
  ),
});

type Particle = {
  size: number;
  top: string;
  left?: string;
  right?: string;
  animation: string;
  delay: string;
  opacity: number;
};

const PARTICLES: Particle[] = [
  {
    size: 3,
    top: '15%',
    left: '8%',
    animation: 'drift-1 8s ease-in-out infinite',
    delay: '0s',
    opacity: 0.25,
  },
  {
    size: 2,
    top: '25%',
    right: '12%',
    animation: 'drift-2 11s ease-in-out infinite',
    delay: '1.5s',
    opacity: 0.18,
  },
  {
    size: 4,
    top: '65%',
    left: '5%',
    animation: 'drift-3 9s ease-in-out infinite',
    delay: '3s',
    opacity: 0.2,
  },
  {
    size: 2,
    top: '70%',
    right: '7%',
    animation: 'drift-1 12s ease-in-out infinite',
    delay: '2s',
    opacity: 0.15,
  },
  {
    size: 3,
    top: '40%',
    left: '20%',
    animation: 'drift-2 10s ease-in-out infinite',
    delay: '4s',
    opacity: 0.12,
  },
  {
    size: 2,
    top: '55%',
    right: '22%',
    animation: 'drift-3 7s ease-in-out infinite',
    delay: '0.5s',
    opacity: 0.2,
  },
  {
    size: 5,
    top: '80%',
    left: '40%',
    animation: 'drift-1 14s ease-in-out infinite',
    delay: '2.5s',
    opacity: 0.1,
  },
  {
    size: 2,
    top: '10%',
    left: '55%',
    animation: 'drift-2 9s ease-in-out infinite',
    delay: '1s',
    opacity: 0.22,
  },
];

const STATS = [
  { n: '11', label: 'Módulos' },
  { n: '4', label: 'Ciclos' },
  { n: '∞', label: 'Permisos' },
];

export function LandingHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const line1Ref = useRef<HTMLSpanElement>(null);
  const line2Ref = useRef<HTMLSpanElement>(null);
  const line3Ref = useRef<HTMLSpanElement>(null);
  const line4Ref = useRef<HTMLSpanElement>(null);
  const line5Ref = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const echoDotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.fromTo(
        [line1Ref.current, line2Ref.current, line3Ref.current, line4Ref.current, line5Ref.current],
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.9, stagger: 0.12 },
      )
        .fromTo(
          subtitleRef.current,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7 },
          '-=0.4',
        )
        .fromTo(
          ctaRef.current,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6 },
          '-=0.3',
        );

      if (echoDotRef.current) {
        gsap.fromTo(
          echoDotRef.current,
          { x: 40, opacity: 0 },
          { x: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.5 },
        );
      }

      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8,
        onUpdate: (self) => {
          const y = self.progress * 80;
          gsap.set(
            [
              line1Ref.current,
              line2Ref.current,
              line3Ref.current,
              line4Ref.current,
              line5Ref.current,
            ],
            { y: y * 0.4, opacity: 1 - self.progress * 0.6 },
          );
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ paddingTop: 108 }}
    >
      {/* ASCII background */}
      <AsciiBackground />

      {/* Particles */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <div
            key={`p-${p.top}-${p.left || p.right}`}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              top: p.top,
              left: p.left,
              right: p.right,
              background:
                i % 3 === 0
                  ? 'var(--color-primary)'
                  : i % 3 === 1
                    ? 'var(--color-accent)'
                    : '#818cf8',
              animation: p.animation,
              animationDelay: p.delay,
              opacity: p.opacity,
              filter: `blur(${p.size > 3 ? 1 : 0}px)`,
            }}
          />
        ))}
      </div>

      {/* Radial glow */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 40% 50%, rgba(108,99,255,0.12) 0%, transparent 65%)',
        }}
      />

      {/* Top vignette */}
      <div
        className="absolute top-0 left-0 right-0 h-40 pointer-events-none z-0"
        aria-hidden="true"
        style={{ background: 'linear-gradient(to bottom, var(--color-background), transparent)' }}
      />

      {/* Content grid */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-16 items-center">
          {/* Left: Headline + CTA */}
          <div className="flex flex-col items-start gap-8">
            {/* Sparkles decorativos */}
            <div className="relative self-start" aria-hidden="true">
              <Sparkle
                size={14}
                style={{
                  color: 'var(--color-accent)',
                  animation: 'sparkle-spin 4s linear infinite',
                  position: 'absolute',
                  top: -8,
                  left: -20,
                  opacity: 0.7,
                }}
              />
              <Sparkle
                size={9}
                style={{
                  color: 'var(--color-primary)',
                  animation: 'sparkle-spin 6s linear infinite reverse',
                  position: 'absolute',
                  top: -18,
                  left: 30,
                  opacity: 0.5,
                }}
              />
            </div>

            {/* Headline */}
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl leading-[1.02] tracking-tight text-text-primary">
              <span className="block">
                <span
                  ref={line1Ref}
                  className="font-serif inline-block mr-3 md:mr-4"
                  style={{ opacity: 0 }}
                >
                  La
                </span>
                <span
                  ref={line2Ref}
                  className="inline-block italic"
                  style={{
                    opacity: 0,
                    background:
                      'linear-gradient(135deg, #fff 0%, var(--color-primary) 50%, #a78bfa 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  súper app
                </span>
              </span>
              <span ref={line3Ref} className="font-serif block" style={{ opacity: 0 }}>
                para la gestión
              </span>
              <span
                ref={line4Ref}
                className="block italic"
                style={{
                  opacity: 0,
                  background:
                    'linear-gradient(135deg, #fff 0%, var(--color-primary) 50%, #a78bfa 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                súper inteligente
              </span>
              <span ref={line5Ref} className="font-serif block" style={{ opacity: 0 }}>
                de tus proyectos.
              </span>
            </h1>

            {/* Subtitle */}
            <p
              ref={subtitleRef}
              className="font-serif text-lg md:text-xl text-text-secondary max-w-lg leading-relaxed"
              style={{ opacity: 0 }}
            >
              Tableros Kanban, permisos dinámicos por rol y reportes de desviación. Con integración{' '}
              <span className="text-text-primary font-semibold">Alexa Skill</span> para gestionar
              tus proyectos por voz.
            </p>

            {/* CTA buttons */}
            <div
              ref={ctaRef}
              className="flex flex-col sm:flex-row gap-3 items-start"
              style={{ opacity: 0 }}
            >
              <a href="/auth/signup">
                <button
                  type="button"
                  className="font-sans text-sm font-semibold px-7 py-3 rounded-full transition-all duration-200 cursor-pointer"
                  style={{
                    background: 'var(--color-primary)',
                    color: '#fff',
                    boxShadow: '0 4px 24px rgba(108,99,255,0.35)',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.boxShadow = '0 4px 40px rgba(108,99,255,0.6)';
                    el.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.boxShadow = '0 4px 24px rgba(108,99,255,0.35)';
                    el.style.transform = 'translateY(0)';
                  }}
                >
                  Comenzar gratis
                </button>
              </a>
              <a href="/auth/login">
                <button
                  type="button"
                  className="font-sans text-sm font-medium px-7 py-3 rounded-full border transition-all duration-200 cursor-pointer text-text-secondary hover:text-text-primary"
                  style={{ borderColor: 'rgba(255,255,255,0.12)' }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = 'rgba(255,255,255,0.25)';
                    el.style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = 'rgba(255,255,255,0.12)';
                    el.style.background = 'transparent';
                  }}
                >
                  Iniciar sesión
                </button>
              </a>
            </div>

            {/* Micro stats */}
            <div className="flex items-center gap-6 pt-2">
              {STATS.map((s) => (
                <StatItem key={s.label} value={s.n} label={s.label} />
              ))}
            </div>
          </div>

          {/* Right: Echo Dot 3D */}
          <div ref={echoDotRef} className="hidden lg:flex justify-center" style={{ opacity: 0 }}>
            <EchoDot3D />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 opacity-40"
        aria-hidden="true"
      >
        <span className="font-sans text-xs text-text-disabled tracking-widest uppercase">
          Scroll
        </span>
        <div className="w-px h-8 bg-gradient-to-b from-text-disabled to-transparent" />
      </div>
    </section>
  );
}
