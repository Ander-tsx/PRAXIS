'use client';

import Link from 'next/link';
import { Sparkle } from '@praxis/commons';

const TRUST_SIGNALS = [
  '✓ Configuración en menos de 2 minutos',
  '✓ Sin límite de proyectos',
  '✓ Integración Alexa Skill incluida',
];

export function LandingCTA() {
  return (
    <section id="pricing" className="py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        {/* Sparkle row */}
        <div className="flex items-center justify-center gap-4 mb-6" aria-hidden="true">
          <Sparkle
            style={{
              color: 'var(--color-primary)',
              animation: 'sparkle-spin 4s linear infinite',
              opacity: 0.7,
            }}
            size={16}
          />
          <Sparkle
            style={{
              color: 'var(--color-accent)',
              animation: 'sparkle-spin 6s linear infinite reverse',
              opacity: 0.5,
            }}
            size={10}
          />
          <Sparkle
            style={{ color: '#a78bfa', animation: 'sparkle-spin 5s linear infinite', opacity: 0.6 }}
            size={12}
          />
        </div>

        {/* Headline */}
        <h2 className="font-display text-5xl md:text-6xl text-text-primary italic mb-4">
          Empieza hoy mismo.
        </h2>
        <p className="font-serif text-lg text-text-secondary italic max-w-md mx-auto mb-10">
          Sin tarjeta de crédito. Sin compromisos. Solo tu equipo y sus proyectos, bajo control.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-12">
          <Link href="/signup">
            <button
              type="button"
              className="font-sans text-sm font-semibold px-8 py-3.5 rounded-full transition-all duration-200 cursor-pointer"
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                boxShadow: '0 4px 24px rgba(108,99,255,0.35)',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.boxShadow = '0 4px 48px rgba(108,99,255,0.65)';
                el.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.boxShadow = '0 4px 24px rgba(108,99,255,0.35)';
                el.style.transform = 'translateY(0)';
              }}
            >
              Crear cuenta gratis
            </button>
          </Link>
          <Link href="/login">
            <button
              type="button"
              className="font-sans text-sm font-medium px-8 py-3.5 rounded-full border transition-all duration-200 cursor-pointer text-text-secondary hover:text-text-primary"
              style={{ borderColor: 'rgba(255,255,255,0.12)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.25)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)';
              }}
            >
              Iniciar sesión
            </button>
          </Link>
        </div>

        {/* Trust signals */}
        <div className="flex flex-col sm:flex-row gap-5 items-center justify-center font-sans text-xs text-text-disabled">
          {TRUST_SIGNALS.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
