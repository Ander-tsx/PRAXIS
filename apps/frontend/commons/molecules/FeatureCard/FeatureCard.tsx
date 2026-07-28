'use client';

import { type ReactNode, useState } from 'react';

export interface FeatureCardData {
  id: number;
  icon: ReactNode;
  title: string;
  description: string;
  /** Etiqueta corta de categoría, ej. "Tableros". */
  badge: string;
  /**
   * Escena visual propia de la card. Recibe `active` para que cada una
   * defina su propia animación al pasar el cursor.
   */
  visual: (active: boolean) => ReactNode;
  /** Color de acento en hex. */
  accent: string;
}

export interface FeatureCardProps {
  card: FeatureCardData;
}

/**
 * FeatureCard — molécula de la rejilla de características.
 *
 * El título y la descripción **siempre** están visibles: el hover añade
 * información en la escena superior, no la sustituye. Cada card entrega su
 * propia escena mediante `visual(active)`, así que la animación es distinta
 * en cada una sin que la molécula sepa nada de su contenido.
 */
export function FeatureCard({ card }: FeatureCardProps) {
  const [active, setActive] = useState(false);

  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      style={{
        background: active ? '#171722' : '#131319',
        border: `1px solid ${active ? `${card.accent}45` : 'rgba(255,255,255,0.07)'}`,
        transition:
          'background 320ms ease, border-color 320ms ease, transform 420ms cubic-bezier(.22,1,.36,1), box-shadow 320ms ease',
        transform: active ? 'translateY(-4px)' : 'none',
        boxShadow: active
          ? `0 18px 48px rgba(0,0,0,0.5), 0 0 48px -12px ${card.accent}40`
          : '0 1px 2px rgba(0,0,0,0.3)',
      }}
    >
      {/* Halo inferior */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 75% 55% at 50% 108%, ${card.accent}1f 0%, transparent 70%)`,
          opacity: active ? 1 : 0,
          transition: 'opacity 400ms ease',
        }}
      />

      {/* Línea superior que se ilumina */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${card.accent}, transparent)`,
          opacity: active ? 0.9 : 0,
          transition: 'opacity 400ms ease',
        }}
      />

      {/*
        Escena visual — decorativa. Toda la información está en el título y la
        descripción, que nunca se ocultan, así que quien navegue con teclado o
        lector de pantalla no se pierde nada al no poder activar el hover.
      */}
      <div
        aria-hidden="true"
        className="relative flex items-center justify-center overflow-hidden"
        style={{ height: 188, padding: '20px 20px 0' }}
      >
        <div
          className="h-full w-full rounded-xl"
          style={{
            background: active ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.015)',
            border: `1px solid ${active ? `${card.accent}22` : 'rgba(255,255,255,0.05)'}`,
            transition: 'background 320ms ease, border-color 320ms ease',
          }}
        >
          {card.visual(active)}
        </div>
      </div>

      {/* ── Texto ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex flex-shrink-0 items-center justify-center rounded-xl"
            style={{
              width: 40,
              height: 40,
              background: active ? `${card.accent}1a` : 'rgba(255,255,255,0.05)',
              border: `1px solid ${active ? `${card.accent}40` : 'rgba(255,255,255,0.07)'}`,
              color: active ? card.accent : 'rgba(255,255,255,0.4)',
              transition: 'all 320ms ease',
            }}
          >
            {card.icon}
          </span>

          <h3
            className="font-sans text-[0.95rem] font-semibold leading-tight"
            style={{ color: '#f0f0f5', letterSpacing: '-0.01em' }}
          >
            {card.title}
          </h3>

          <span
            className="ml-auto flex-shrink-0 rounded-full px-2.5 py-1 font-sans text-[0.65rem] font-medium uppercase tracking-wide"
            style={{
              border: `1px solid ${active ? `${card.accent}35` : 'rgba(255,255,255,0.08)'}`,
              background: active ? `${card.accent}12` : 'transparent',
              color: active ? card.accent : 'rgba(255,255,255,0.3)',
              transition: 'all 320ms ease',
            }}
          >
            {card.badge}
          </span>
        </div>

        <p
          className="font-sans text-[0.83rem] leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {card.description}
        </p>
      </div>
    </article>
  );
}
