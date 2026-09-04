'use client';

/**
 * Características — un índice editorial, no una rejilla de tarjetas.
 *
 * La versión anterior tenía nueve cajas idénticas con una miniatura de
 * interfaz dentro: mucho adorno, poco argumento. Esta es la lista completa
 * en tipografía grande, con la descripción al lado — el mismo lenguaje que
 * ya usa el footer (filas con raya punteada, flecha que entra al pasar el
 * cursor), así que la página deja de sentirse como secciones distintas
 * pegadas una tras otra.
 */
import { Reveal } from '@praxis/commons';
import { useState } from 'react';

const FEATURES = [
  {
    n: '01',
    title: 'Tableros Kanban',
    body: 'Columnas configurables por tablero. Mueve una tarea y su estado se actualiza para todo el equipo al instante.',
  },
  {
    n: '02',
    title: 'Checklists por tarea',
    body: 'Divide el trabajo grande en pasos verificables. Cada tarea lleva su propia lista, y lo que falta se ve desde el tablero.',
  },
  {
    n: '03',
    title: 'Espacios y tableros',
    body: 'Una jerarquía clara para que nada quede suelto: agrupa por espacio de trabajo y divide en los tableros que hagan falta.',
  },
  {
    n: '04',
    title: 'Equipo y asignaciones',
    body: 'Invita a tu equipo, dale un rol dentro del proyecto y asigna responsables con fecha límite y prioridad.',
  },
  {
    n: '05',
    title: 'Permisos por rol',
    body: 'Cada proyecto define sus propios roles y decide, permiso a permiso, quién crea, edita o elimina.',
  },
  {
    n: '06',
    title: 'Avisos en tiempo real',
    body: 'Te asignan, te mencionan o vence tu tarea: el aviso llega a la bandeja al instante y lleva directo a lo que cambió.',
  },
  {
    n: '07',
    title: 'Chat de equipo',
    body: 'Un chat por proyecto y conversaciones privadas, con menciones y no leídos — sin salir de Praxis a coordinar.',
  },
  {
    n: '08',
    title: 'Tu propio lienzo de reportes',
    body: 'Elige qué widgets ver y en qué orden. El lienzo es tuyo: nadie más lo reorganiza, y arranca vacío hasta que lo montas.',
  },
] as const;

function FeatureRow({ feature, index }: { feature: (typeof FEATURES)[number]; index: number }) {
  const [active, setActive] = useState(false);

  return (
    <Reveal
      as="li"
      delay={(index % 4) * 0.05}
      duration={0.7}
      innerClassName="block border-b border-dotted"
      style={{ borderColor: 'var(--l-border)' }}
    >
      <button
        type="button"
        className="grid w-full grid-cols-1 items-baseline gap-x-8 gap-y-2 py-8 text-left md:grid-cols-[3rem_1fr_1.1fr] md:py-10"
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
      >
        <span
          className="font-mono text-xs transition-colors duration-300 md:text-sm"
          style={{ color: active ? 'var(--l-fg)' : 'var(--l-fg-muted)' }}
        >
          {feature.n}
        </span>

        <span
          className="text-3xl leading-[1.05] transition-transform duration-300 ease-[var(--ease-transition)] md:text-4xl"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 500,
            color: 'var(--l-fg)',
            transform: active ? 'translateX(0.4rem)' : 'translateX(0)',
          }}
        >
          {feature.title}
        </span>

        <span
          className="max-w-md font-sans text-sm leading-relaxed transition-opacity duration-300 md:text-base"
          style={{ color: 'var(--l-fg-muted)', opacity: active ? 1 : 0.75 }}
        >
          {feature.body}
        </span>
      </button>
    </Reveal>
  );
}

export function LandingFeatures() {
  return (
    <section
      id="features"
      data-theme-section="light"
      className="landing-light px-6 py-32 md:py-44"
      style={{ background: 'var(--l-bg)', color: 'var(--l-fg)' }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 md:mb-24">
          <Reveal innerClassName="font-mono text-xs font-medium uppercase tracking-widest">
            <span style={{ color: 'var(--l-fg-muted)' }}>Características · 01–08</span>
          </Reveal>
          <Reveal
            delay={0.05}
            className="mt-4"
            innerClassName="text-4xl md:text-6xl"
            duration={0.9}
          >
            <span style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}>
              Todo lo que tu equipo necesita.
            </span>
          </Reveal>
        </div>

        <ul
          className="m-0 flex list-none flex-col border-t border-dotted pl-0"
          style={{ borderColor: 'var(--l-border)' }}
        >
          {FEATURES.map((feature, i) => (
            <FeatureRow key={feature.n} feature={feature} index={i} />
          ))}
        </ul>
      </div>
    </section>
  );
}
