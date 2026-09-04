'use client';

/**
 * Automatización — un flujo, no una tarjeta con una maqueta de formulario
 * dentro. "Cuando → Si → Entonces" se lee de izquierda a derecha como lo que
 * es: una frase, con una línea que la recorre en vez de un borde alrededor.
 */
import { Reveal } from '@praxis/commons';

const STAGES = [
  {
    n: '01',
    label: 'Cuando',
    text: 'Se crea una tarea, cambia de columna o se acerca su fecha límite.',
  },
  {
    n: '02',
    label: 'Si',
    text: 'Solo si hace falta acotarlo — prioridad alta, un tablero concreto. Es opcional.',
  },
  {
    n: '03',
    label: 'Entonces',
    text: 'Asigna, mueve o notifica. Praxis lo hace sola, sin que nadie tenga que acordarse.',
  },
] as const;

const EXECUTIONS = [
  { rule: 'Notificar al vencer', done: true, time: 'hace 4 min' },
  { rule: 'Asignar por defecto', done: true, time: 'hace 1 h' },
  { rule: 'Mover a "Bloqueado"', done: false, time: 'hace 3 h' },
] as const;

function FlowStage({ stage, index }: { stage: (typeof STAGES)[number]; index: number }) {
  return (
    <div className="relative flex flex-1 flex-col gap-3">
      {/* La línea que atraviesa las tres etapas — un solo trazo continuo,
          partido visualmente por el hueco entre columnas en desktop. */}
      <div className="hidden items-center md:flex" aria-hidden="true">
        <span
          className="h-1.5 w-1.5 flex-none rounded-full"
          style={{ background: 'var(--l-fg)' }}
        />
        <span className="ml-2 h-px flex-1" style={{ background: 'var(--l-border)' }} />
      </div>

      <Reveal delay={index * 0.08} innerClassName="flex flex-col gap-2">
        <span className="font-mono text-xs" style={{ color: 'var(--l-fg-muted)' }}>
          {stage.n}
        </span>
        <span
          className="text-3xl md:text-4xl"
          style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', color: 'var(--l-fg)' }}
        >
          {stage.label}
        </span>
        <p
          className="max-w-[26ch] font-sans text-sm leading-relaxed"
          style={{ color: 'var(--l-fg-muted)' }}
        >
          {stage.text}
        </p>
      </Reveal>
    </div>
  );
}

export function LandingAutomation() {
  return (
    <section
      id="automatizacion"
      className="px-6 py-32 md:py-44"
      style={{ background: 'var(--l-bg)', color: 'var(--l-fg)' }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 flex flex-col gap-5 md:mb-24 md:max-w-2xl">
          <Reveal innerClassName="font-mono text-xs font-medium uppercase tracking-widest">
            <span style={{ color: 'var(--l-fg-muted)' }}>Automatización</span>
          </Reveal>
          <Reveal delay={0.05} innerClassName="text-4xl md:text-6xl" duration={0.9}>
            <span style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}>
              Reglas que reaccionan solas.
            </span>
          </Reveal>
          <Reveal delay={0.1} innerClassName="font-serif text-lg italic leading-relaxed">
            <span style={{ color: 'var(--l-fg-muted)' }}>
              Un motor que escucha cada cambio del proyecto en tiempo real y actúa por ti, en vez de
              esperar a que alguien recuerde hacerlo a mano.
            </span>
          </Reveal>
        </div>

        <div
          className="flex flex-col gap-10 border-t border-dotted pt-12 md:flex-row md:gap-8"
          style={{ borderColor: 'var(--l-border)' }}
        >
          {STAGES.map((stage, i) => (
            <FlowStage key={stage.label} stage={stage} index={i} />
          ))}
        </div>

        <div className="mt-16 md:mt-24">
          <Reveal innerClassName="font-mono text-xs uppercase tracking-widest">
            <span style={{ color: 'var(--l-fg-muted)' }}>Últimas ejecuciones</span>
          </Reveal>

          <ul
            className="m-0 mt-5 flex list-none flex-col border-t border-dotted pl-0"
            style={{ borderColor: 'var(--l-border)' }}
          >
            {EXECUTIONS.map((exec, i) => (
              <Reveal
                key={exec.rule}
                as="li"
                delay={0.05 + i * 0.05}
                duration={0.7}
                innerClassName="flex items-center justify-between gap-4 border-b border-dotted py-4"
                style={{ borderColor: 'var(--l-border)' }}
              >
                <span
                  className="flex items-center gap-3 font-sans text-sm md:text-base"
                  style={{ color: 'var(--l-fg)' }}
                >
                  <span
                    className="h-1.5 w-1.5 flex-none rounded-full"
                    style={{ background: exec.done ? 'var(--l-fg)' : 'var(--l-border)' }}
                    aria-hidden="true"
                  />
                  {exec.rule}
                </span>
                <span className="font-mono text-xs" style={{ color: 'var(--l-fg-muted)' }}>
                  {exec.time}
                </span>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
