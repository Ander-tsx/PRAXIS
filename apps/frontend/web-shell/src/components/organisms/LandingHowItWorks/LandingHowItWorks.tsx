'use client';

import { RoleBadge, Sparkle, alpha } from '@praxis/commons';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { type ReactNode, useEffect, useRef } from 'react';

interface RoleData {
  role: string;
  roleColor: string;
  tagline: string;
  steps: string[];
  visual: ReactNode;
}

/* ── Piezas visuales ──────────────────────────────────────────── */

function Panel({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-5"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-sans text-xs font-medium text-text-secondary">{title}</span>
        {meta && <span className="font-sans text-xs text-text-disabled">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

/** Rol de proyecto con su diccionario de permisos, tal cual lo modela el backend. */
function ProjectRolePanel() {
  const roles = [
    { name: 'Scrum Master', permissions: 10, color: 'var(--color-primary)' },
    { name: 'Desarrollo', permissions: 5, color: '#818cf8' },
    { name: 'QA', permissions: 3, color: '#34d399' },
  ];

  return (
    <Panel title="Roles del proyecto" meta="Aurora">
      <div className="flex flex-col gap-2">
        {roles.map((role) => (
          <div
            key={role.name}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: role.color }} />
            <span className="font-sans text-xs text-text-primary">{role.name}</span>
            <span className="ml-auto font-mono text-[0.65rem] text-text-disabled">
              {role.permissions} de 10 permisos
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['canCreateBoard', 'canManageMembers', 'canManageRoles'].map((permission) => (
          <span
            key={permission}
            className="rounded px-2 py-0.5 font-mono text-[0.6rem]"
            style={{ background: 'var(--color-primary-muted)', color: 'var(--color-primary)' }}
          >
            {permission}
          </span>
        ))}
      </div>
    </Panel>
  );
}

/** Vista del miembro: sus tareas asignadas en el tablero. */
function MemberTasksPanel() {
  const tasks = [
    { name: 'Formulario de registro', column: 'En progreso', color: 'var(--color-warning)', priority: 'ALTA' },
    { name: 'Validar DTOs del gateway', column: 'Por hacer', color: 'var(--color-info)', priority: 'MEDIA' },
    { name: 'Migración de permisos', column: 'Hecho', color: 'var(--color-success)', priority: 'BAJA' },
  ];

  return (
    <Panel title="Mis tareas asignadas" meta="Sprint 4">
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <div
            key={task.name}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: task.color }} />
            <span className="flex-1 truncate font-sans text-xs text-text-primary">{task.name}</span>
            <span
              className="flex-shrink-0 rounded px-1.5 py-0.5 font-sans text-[0.6rem] font-medium"
              style={{ background: alpha(task.color, 12), color: task.color }}
            >
              {task.column}
            </span>
          </div>
        ))}
      </div>
      <span className="font-sans text-xs text-text-disabled">
        Solo aparecen los tableros de los proyectos donde eres miembro.
      </span>
    </Panel>
  );
}

/** Vista del administrador de plataforma: usuarios y roles globales. */
function AdminPanel() {
  const users = [
    { name: 'Andrés G.', email: 'andres@praxis.dev', role: 'Admin', color: 'var(--color-accent)' },
    { name: 'Juan J.', email: 'juan@praxis.dev', role: 'User', color: 'var(--color-text-secondary)' },
    { name: 'César E.', email: 'cesar@praxis.dev', role: 'User', color: 'var(--color-text-secondary)' },
  ];

  return (
    <Panel title="Usuarios de la plataforma" meta="3 activos">
      <div className="flex flex-col gap-2">
        {users.map((user) => (
          <div
            key={user.email}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            <div className="flex flex-col">
              <span className="font-sans text-xs text-text-primary">{user.name}</span>
              <span className="font-sans text-[0.65rem] text-text-disabled">{user.email}</span>
            </div>
            <span
              className="ml-auto rounded-full px-2.5 py-0.5 font-sans text-[0.65rem] font-medium"
              style={{
                background: alpha(user.color, 12),
                color: user.color,
                border: `1px solid ${alpha(user.color, 30)}`,
              }}
            >
              {user.role}
            </span>
          </div>
        ))}
      </div>
      <span className="font-sans text-xs text-text-disabled">
        El rol global no otorga permisos dentro de un proyecto ajeno.
      </span>
    </Panel>
  );
}

/* ── Contenido ────────────────────────────────────────────────── */

const ROLES: RoleData[] = [
  {
    role: 'Responsable del proyecto',
    roleColor: 'var(--color-primary)',
    tagline: 'Define las reglas del juego',
    steps: [
      'Crea el proyecto y lo divide en espacios de trabajo y tableros',
      'Define los roles propios del proyecto: Scrum Master, Desarrollo, QA o los que necesite',
      'Ajusta permiso a permiso lo que puede hacer cada rol sobre tareas, tableros y columnas',
      'Invita a su equipo y le asigna el rol que le corresponde',
    ],
    visual: <ProjectRolePanel />,
  },
  {
    role: 'Miembro del equipo',
    roleColor: '#38bdf8',
    tagline: 'Enfocado en lo que le toca',
    steps: [
      'Entra directamente a los tableros de los proyectos donde participa',
      'Mueve sus tareas entre columnas y actualiza prioridad y fecha límite',
      'Desglosa el trabajo en subtareas y marca los ítems del checklist',
      'Solo ve las acciones que su rol le permite: la interfaz se adapta a sus permisos',
    ],
    visual: <MemberTasksPanel />,
  },
  {
    role: 'Administración',
    roleColor: 'var(--color-accent)',
    tagline: 'Gobierna la plataforma, no los proyectos',
    steps: [
      'Da de alta usuarios y gestiona su estado en la plataforma',
      'Asigna los roles globales que dan acceso al panel de administración',
      'Consulta la actividad general sin entrar en el detalle de cada proyecto',
      'No hereda permisos dentro de proyectos de los que no es miembro',
    ],
    visual: <AdminPanel />,
  },
];

export function LandingHowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.fromTo(
        headingRef.current,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: headingRef.current, start: 'top 85%' },
        },
      );

      for (const [i, card] of cardsRef.current.entries()) {
        if (!card) continue;
        gsap.fromTo(
          card,
          { x: i % 2 === 0 ? -50 : 50, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: { trigger: card, start: 'top 80%' },
          },
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section id="how-it-works" ref={sectionRef} className="relative overflow-hidden px-6 py-32">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 80% 50%, rgba(108,99,255,0.05) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        <div ref={headingRef} className="mb-20 text-center opacity-0">
          <div className="mb-4 flex items-center justify-center gap-4">
            <Sparkle
              style={{
                color: 'var(--color-primary)',
                animation: 'sparkle-spin 5s linear infinite',
                opacity: 0.6,
              }}
            />
            <h2 className="font-display text-4xl italic text-text-primary md:text-5xl">
              Cómo usan Praxis los equipos
            </h2>
            <Sparkle
              style={{
                color: 'var(--color-accent)',
                animation: 'sparkle-spin 5s linear infinite reverse',
                opacity: 0.6,
              }}
            />
          </div>
          <p className="mx-auto max-w-xl font-serif text-lg italic text-text-secondary">
            Cada persona ve exactamente lo que su rol le permite. Ni más, ni menos.
          </p>
        </div>

        <div className="flex flex-col gap-16">
          {ROLES.map((role, i) => (
            <div
              key={role.role}
              ref={(el) => {
                cardsRef.current[i] = el;
              }}
              className={`grid grid-cols-1 items-center gap-10 opacity-0 lg:grid-cols-2 ${
                i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
              }`}
            >
              <div className="flex flex-col gap-6">
                <RoleBadge
                  index={i + 1}
                  role={role.role}
                  tagline={role.tagline}
                  color={role.roleColor}
                />

                <h3 className="font-display text-2xl text-text-primary md:text-3xl">
                  {role.tagline}
                </h3>

                <ul className="flex flex-col gap-3">
                  {role.steps.map((step, si) => (
                    <li key={step} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full font-sans text-[0.6rem] font-bold"
                        style={{
                          background: alpha(role.roleColor, 12),
                          color: role.roleColor,
                          border: `1px solid ${alpha(role.roleColor, 30)}`,
                        }}
                        aria-hidden="true"
                      >
                        {si + 1}
                      </span>
                      <span className="font-sans text-sm leading-relaxed text-text-secondary">
                        {step}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>{role.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
