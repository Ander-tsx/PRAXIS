'use client';

import { SectionEyebrow } from '@/components/molecules/SectionEyebrow';
/**
 * Cómo funciona — cada rol con sus pasos y una frase grande al lado, no una
 * maqueta de panel. La versión anterior mostraba una tarjeta con datos de
 * ejemplo (roles, tareas, usuarios) que se leía como una captura de
 * pantalla; esta usa la propia tipografía para decir lo mismo, coherente con
 * el resto de la página.
 */
import { Reveal, RoleBadge } from '@praxis/commons';

interface RoleData {
  role: string;
  tagline: string;
  quote: string;
  steps: readonly string[];
}

const ROLES: readonly RoleData[] = [
  {
    role: 'Responsable del proyecto',
    tagline: 'Define las reglas del juego',
    quote: 'Permiso a permiso, no todo o nada.',
    steps: [
      'Crea el proyecto y lo divide en espacios de trabajo y tableros',
      'Define los roles propios del proyecto: Scrum Master, Desarrollo, QA o los que necesite',
      'Ajusta permiso a permiso lo que puede hacer cada rol sobre tareas, tableros y columnas',
      'Invita a su equipo y le asigna el rol que le corresponde',
    ],
  },
  {
    role: 'Miembro del equipo',
    tagline: 'Enfocado en lo que le toca',
    quote: 'Ve exactamente lo que le toca. Ni más, ni menos.',
    steps: [
      'Entra directamente a los tableros de los proyectos donde participa',
      'Mueve sus tareas entre columnas y actualiza prioridad y fecha límite',
      /* Decía «subtareas», y no las exponemos: la landing prometía una función
         que no existe en ninguna pantalla. Ver ESTADO-ACTUAL §24.5. */
      'Desglosa el trabajo en pasos y los va marcando en el checklist',
      'Solo ve las acciones que su rol le permite: la interfaz se adapta a sus permisos',
    ],
  },
  {
    role: 'Administración',
    tagline: 'Gobierna la plataforma, no los proyectos',
    quote: 'Gobierna la plataforma, nunca los proyectos.',
    steps: [
      'Da de alta usuarios y gestiona su estado en la plataforma',
      'Asigna los roles globales que dan acceso al panel de administración',
      'Consulta la actividad general sin entrar en el detalle de cada proyecto',
      'No hereda permisos dentro de proyectos de los que no es miembro',
    ],
  },
] as const;

function RoleSection({ role, index }: { role: RoleData; index: number }) {
  return (
    <div
      className={`grid grid-cols-1 items-start gap-10 border-t border-dotted py-16 md:grid-cols-2 md:gap-16 md:py-20 ${
        index % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''
      }`}
      style={{ borderColor: 'var(--l-border)' }}
    >
      <div className="flex flex-col gap-6">
        <RoleBadge index={index + 1} role={role.role} tagline={role.tagline} color="var(--l-fg)" />

        <Reveal as="h3" innerClassName="text-2xl md:text-3xl">
          <span
            style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500, color: 'var(--l-fg)' }}
          >
            {role.tagline}
          </span>
        </Reveal>

        <ul className="flex flex-col gap-3">
          {role.steps.map((step, si) => (
            <Reveal
              key={step}
              as="li"
              delay={0.05 + si * 0.04}
              duration={0.7}
              innerClassName="flex items-start gap-3"
            >
              <span
                className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full font-sans text-[0.6rem] font-bold"
                style={{
                  background: 'color-mix(in srgb, var(--l-fg) 10%, transparent)',
                  color: 'var(--l-fg)',
                  border: '1px solid color-mix(in srgb, var(--l-fg) 30%, transparent)',
                }}
                aria-hidden="true"
              >
                {si + 1}
              </span>
              <span
                className="font-sans text-sm leading-relaxed"
                style={{ color: 'var(--l-fg-muted)' }}
              >
                {step}
              </span>
            </Reveal>
          ))}
        </ul>
      </div>

      <Reveal delay={0.1} duration={0.9} className="flex md:h-full md:items-center">
        <blockquote
          className="m-0 border-0 p-0 text-3xl leading-[1.15] md:text-5xl"
          style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', color: 'var(--l-fg)' }}
        >
          «{role.quote}»
        </blockquote>
      </Reveal>
    </div>
  );
}

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden px-6 py-32 md:py-44"
      style={{ background: 'var(--l-bg)', color: 'var(--l-fg)' }}
    >
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-16 flex flex-col gap-5 md:mb-4 md:max-w-2xl">
          <SectionEyebrow>Cómo funciona</SectionEyebrow>
          <Reveal delay={0.05} innerClassName="text-4xl italic md:text-6xl" duration={0.9}>
            <span style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}>
              Cómo usan Praxis los equipos.
            </span>
          </Reveal>
          <Reveal delay={0.1} innerClassName="font-serif text-lg italic leading-relaxed">
            <span style={{ color: 'var(--l-fg-muted)' }}>
              Cada persona ve exactamente lo que su rol le permite.
            </span>
          </Reveal>
        </div>

        <div className="flex flex-col">
          {ROLES.map((role, i) => (
            <RoleSection key={role.role} role={role} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
