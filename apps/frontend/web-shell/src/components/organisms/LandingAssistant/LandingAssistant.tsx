'use client';

/**
 * Asistente — la conversación como guion, no como maqueta de chat. Sin
 * burbujas, sin tarjeta: una etiqueta de quién habla y el texto, igual que se
 * lee una entrevista. Es lo que de verdad distingue a PRAX (propone, no
 * ejecuta) — una interfaz de chat de juguete no lo cuenta mejor que el guion.
 */
import { Reveal } from '@praxis/commons';
import type { ReactNode } from 'react';

function Line({
  speaker,
  children,
  delay = 0,
  emphasis = false,
}: {
  speaker: string;
  children: ReactNode;
  delay?: number;
  emphasis?: boolean;
}) {
  return (
    <Reveal
      delay={delay}
      duration={0.8}
      innerClassName="grid grid-cols-[5.5rem_1fr] items-baseline gap-x-4 gap-y-1 md:grid-cols-[7rem_1fr]"
    >
      <span
        className="font-mono text-[0.68rem] uppercase tracking-widest"
        style={{ color: 'var(--l-fg-muted)' }}
      >
        {speaker}
      </span>
      <span
        className={
          emphasis ? 'text-xl leading-snug md:text-2xl' : 'font-sans text-base leading-relaxed'
        }
        style={{
          color: 'var(--l-fg)',
          fontFamily: emphasis ? 'var(--font-fraunces)' : undefined,
          fontStyle: emphasis ? 'italic' : undefined,
        }}
      >
        {children}
      </span>
    </Reveal>
  );
}

export function LandingAssistant() {
  return (
    <section
      id="asistente"
      data-theme-section="light"
      className="landing-light px-6 py-32 md:py-44"
      style={{ background: 'var(--l-bg)', color: 'var(--l-fg)' }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 flex flex-col gap-5 md:mb-24 md:max-w-2xl">
          <Reveal innerClassName="font-mono text-xs font-medium uppercase tracking-widest">
            <span style={{ color: 'var(--l-fg-muted)' }}>Asistente</span>
          </Reveal>
          <Reveal delay={0.05} innerClassName="text-4xl md:text-6xl" duration={0.9}>
            <span style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}>
              PRAX propone, tú decides.
            </span>
          </Reveal>
          <Reveal delay={0.1} innerClassName="font-serif text-lg italic leading-relaxed">
            <span style={{ color: 'var(--l-fg-muted)' }}>
              Conoce el proyecto completo — tareas, columnas, fechas, permisos — y responde con eso,
              no con un resumen genérico.
            </span>
          </Reveal>
        </div>

        <div
          className="flex flex-col gap-7 border-t border-dotted pt-12 md:gap-8"
          style={{ borderColor: 'var(--l-border)' }}
        >
          <Line speaker="Tú" delay={0}>
            ¿Qué tareas no tienen responsable?
          </Line>

          <Line speaker="PRAX" delay={0.08} emphasis>
            Dos: «Revisión de diseño» y «Migración de permisos». ¿Se las asigno a alguien?
          </Line>

          <Reveal
            delay={0.16}
            duration={0.8}
            innerClassName="grid grid-cols-[5.5rem_1fr] items-baseline gap-x-4 gap-y-2 md:grid-cols-[7rem_1fr]"
          >
            <span
              className="font-mono text-[0.68rem] uppercase tracking-widest"
              style={{ color: 'var(--l-fg-muted)' }}
            >
              Propuesta
            </span>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span className="font-sans text-base" style={{ color: 'var(--l-fg)' }}>
                Asignar «Revisión de diseño» a Ana
              </span>
              <span className="flex items-baseline gap-3 font-mono text-xs uppercase tracking-widest">
                <span className="underline underline-offset-4" style={{ color: 'var(--l-fg)' }}>
                  Aceptar
                </span>
                <span style={{ color: 'var(--l-fg-muted)' }}>Rechazar</span>
              </span>
            </span>
          </Reveal>
        </div>

        <ul className="mt-16 flex list-none flex-col gap-4 pl-0 md:mt-24">
          {[
            'Nunca ejecuta por su cuenta: aceptar una propuesta pasa por el mismo botón y el mismo permiso que usarías tú.',
            'Puedes hablarle sin tener un proyecto abierto, y adopta uno cuando la conversación lo necesita.',
            'Le puedes mandar un adjunto y lo tiene en cuenta en lo que responde.',
          ].map((step, i) => (
            <Reveal
              key={step}
              as="li"
              delay={0.05 + i * 0.05}
              innerClassName="flex items-start gap-3"
            >
              <span
                className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
                style={{ background: 'var(--l-fg)' }}
                aria-hidden="true"
              />
              <span
                className="font-sans text-sm leading-relaxed md:text-base"
                style={{ color: 'var(--l-fg-muted)' }}
              >
                {step}
              </span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
