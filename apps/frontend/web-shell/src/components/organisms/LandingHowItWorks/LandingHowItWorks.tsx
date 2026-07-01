'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Sparkle, ProgressBar, RoleBadge } from '@praxis/commons';

interface RoleData {
  role: string;
  roleColor: string;
  tagline: string;
  steps: string[];
  visual: ReactNode;
}

const ROLES: RoleData[] = [
  {
    role: 'Project Manager',
    roleColor: 'var(--color-primary)',
    tagline: 'Toma el control desde el inicio',
    steps: [
      'Crea el proyecto con fechas, presupuesto y descripción',
      'Invita al equipo y asigna roles base (Admin, PM, Colaborador)',
      'Configura permisos granulares: quién ve costos, quién mueve tareas',
      'Monitorea el avance desde el dashboard personalizado',
    ],
    visual: (
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="font-sans text-xs text-text-disabled">Proyecto Alpha · En progreso</span>
        </div>
        <div className="flex gap-3">
          <ProgressBar label="Progreso" value="68%" percentage={68} color="var(--color-primary)" />
          <ProgressBar
            label="Presupuesto"
            value="$32k / $45k"
            percentage={71}
            color="var(--color-accent)"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['proyecto:crear ✓', 'costos:ver ✓', 'reporte:exportar ✓'].map((p) => (
            <span
              key={p}
              className="font-mono text-xs px-2 py-0.5 rounded"
              style={{
                background: 'var(--color-primary-muted)',
                color: 'var(--color-primary)',
                fontSize: 9,
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    role: 'Colaborador',
    roleColor: 'var(--color-accent)',
    tagline: 'Enfocado en lo que le toca',
    steps: [
      'Ve solo las tareas que le fueron asignadas',
      'Actualiza el estado de sus tareas en el tablero Kanban',
      'Registra horas trabajadas y avance real vs. estimado',
      'Recibe notificaciones de cambios en su carga de trabajo',
    ],
    visual: (
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-sans text-xs text-text-secondary font-medium">
            Mis tareas de hoy
          </span>
          <span className="font-sans text-xs text-text-disabled">4 pendientes · 1 atrasada</span>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { name: 'Implementar Login UI', status: 'Doing', color: 'var(--color-warning)' },
            { name: 'Tests unitarios Auth', status: 'To Do', color: 'var(--color-info)' },
            { name: 'Review PR #23', status: 'Done', color: 'var(--color-success)' },
          ].map((t) => (
            <div
              key={t.name}
              className="flex items-center gap-2 p-2 rounded-lg"
              style={{ background: 'var(--color-surface-elevated)' }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span className="font-sans text-xs text-text-primary flex-1 truncate">{t.name}</span>
              <span
                className="font-sans text-xs font-medium px-1.5 py-0.5 rounded"
                style={{ background: `${t.color}15`, color: t.color, fontSize: 9 }}
              >
                {t.status}
              </span>
            </div>
          ))}
        </div>
        <div className="pt-1 flex items-center gap-1.5">
          <span className="font-sans text-xs text-text-disabled">
            Solo ves lo que tienes permiso de ver
          </span>
          <span className="text-xs" aria-hidden="true">
            🔒
          </span>
        </div>
      </div>
    ),
  },
  {
    role: 'Cliente / Observador',
    roleColor: '#a78bfa',
    tagline: 'Visibilidad sin complejidad',
    steps: [
      'Accede a un dashboard personalizado con su vista autorizada',
      'Consulta el avance del proyecto en porcentaje y fechas',
      'Ve los entregables y el estado de cada módulo',
      'No puede ver costos internos ni datos sensibles del equipo',
    ],
    visual: (
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
        <div className="text-center mb-1">
          <span className="font-sans text-xs text-text-disabled">
            Vista del cliente — Solo lectura
          </span>
        </div>
        {[
          { label: 'Frontend', pct: 73, color: '#a78bfa' },
          { label: 'Backend', pct: 55, color: 'var(--color-primary)' },
          { label: 'Base de datos', pct: 90, color: 'var(--color-success)' },
          { label: 'Deploy AWS', pct: 20, color: 'var(--color-warning)' },
        ].map((m) => (
          <ProgressBar
            key={m.label}
            label={m.label}
            value={`${m.pct}%`}
            percentage={m.pct}
            color={m.color}
            height={6}
          />
        ))}
        <div className="flex items-center justify-center gap-2 pt-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#a78bfa' }} />
          <span className="font-sans text-xs text-text-disabled">
            costos:ver — <span className="text-error">sin acceso</span>
          </span>
        </div>
      </div>
    ),
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
    <section id="how-it-works" ref={sectionRef} className="py-32 px-6 relative overflow-hidden">
      {/* Decorative background */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 80% 50%, rgba(108,99,255,0.05) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div ref={headingRef} className="text-center mb-20 opacity-0">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Sparkle
              style={{
                color: 'var(--color-primary)',
                animation: 'sparkle-spin 5s linear infinite',
                opacity: 0.6,
              }}
            />
            <h2 className="font-display text-4xl md:text-5xl text-text-primary italic">
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
          <p className="font-serif text-lg text-text-secondary italic max-w-xl mx-auto">
            Cada rol ve exactamente lo que necesita. Ni más, ni menos.
          </p>
        </div>

        {/* Role cards — alternating layout */}
        <div className="flex flex-col gap-16">
          {ROLES.map((role, i) => (
            <div
              key={role.role}
              ref={(el) => {
                cardsRef.current[i] = el;
              }}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-10 items-center opacity-0 ${i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''}`}
            >
              {/* Text side */}
              <div className="flex flex-col gap-6">
                <RoleBadge
                  index={i + 1}
                  role={role.role}
                  tagline={role.tagline}
                  color={role.roleColor}
                />

                <h3 className="font-display text-2xl md:text-3xl text-text-primary">
                  {role.tagline}
                </h3>

                <ul className="flex flex-col gap-3">
                  {role.steps.map((step, si) => (
                    <li key={si} className="flex items-start gap-3">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 font-sans font-bold"
                        style={{
                          background: `${role.roleColor}15`,
                          color: role.roleColor,
                          fontSize: 9,
                          border: `1px solid ${role.roleColor}30`,
                        }}
                        aria-hidden="true"
                      >
                        {si + 1}
                      </div>
                      <span className="font-sans text-sm text-text-secondary leading-relaxed">
                        {step}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Visual side */}
              <div>{role.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
