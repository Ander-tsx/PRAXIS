'use client';

import { RollCta } from '@/components/molecules/RollCta';
import { Reveal } from '@praxis/commons';

const TRUST_SIGNALS = [
  'Listo para usar en minutos',
  'Sin límite de proyectos ni de tableros',
  'Asistente y automatización incluidos',
];

export interface LandingCTAProps {
  isAuthenticated?: boolean;
}

export function LandingCTA({ isAuthenticated = false }: LandingCTAProps) {
  return (
    <section
      id="pricing"
      data-theme-section="light"
      className="landing-light px-6 py-40 md:py-52"
      style={{ background: 'var(--l-bg)', color: 'var(--l-fg)' }}
    >
      <div className="mx-auto max-w-4xl text-center">
        <Reveal innerClassName="text-6xl italic md:text-8xl" duration={0.9}>
          <span style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}>
            {isAuthenticated ? 'Continúa donde lo dejaste.' : 'Empieza hoy mismo.'}
          </span>
        </Reveal>

        <Reveal
          delay={0.08}
          className="mt-5"
          innerClassName="mx-auto max-w-md font-serif text-lg italic"
        >
          <span style={{ color: 'var(--l-fg-muted)' }}>
            {isAuthenticated
              ? 'Tu cuenta ya está lista. Continúa donde lo dejaste.'
              : 'Crea tu primer proyecto, invita a tu equipo y empieza a repartir el trabajo hoy mismo.'}
          </span>
        </Reveal>

        <Reveal
          delay={0.14}
          className="mt-11"
          innerClassName="flex flex-col items-center justify-center gap-5 sm:flex-row"
        >
          <RollCta
            href={isAuthenticated ? '/projects' : '/auth/signup'}
            label={isAuthenticated ? 'Ir al panel' : 'Crear cuenta gratis'}
            size="lg"
          />
          {!isAuthenticated && (
            <a href="/auth/login" className="font-sans text-sm underline underline-offset-4">
              Iniciar sesión
            </a>
          )}
        </Reveal>

        <Reveal
          delay={0.2}
          className="mt-14"
          innerClassName="flex flex-col items-center justify-center gap-3 font-mono text-xs uppercase tracking-widest sm:flex-row sm:gap-6"
        >
          {TRUST_SIGNALS.map((signal, i) => (
            <span
              key={signal}
              className="flex items-center gap-2"
              style={{ color: 'var(--l-fg-muted)' }}
            >
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="hidden h-3 w-px sm:block"
                  style={{ background: 'var(--l-border)' }}
                />
              )}
              {signal}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
