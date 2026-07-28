'use client';

import { FeatureCard, type FeatureCardData, SectionHeader } from '@praxis/commons';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { type ReactNode, useEffect, useRef } from 'react';

/**
 * Escenas de la rejilla de características.
 *
 * Cada una recibe `active` y define su propia animación de hover. Se usan
 * transiciones con `transitionDelay` escalonado en lugar de keyframes: así el
 * gesto se reproduce hacia delante al entrar y se deshace solo al salir, sin
 * animaciones que se queden a medias.
 */

const EASE = 'cubic-bezier(.22,1,.36,1)';

/* ── 1. Tablero Kanban ─────────────────────────────────────────
   Al pasar el cursor, la tarjeta destacada viaja de "En progreso" a "Hecho". */
function KanbanScene(active: boolean) {
  const columns = [
    { name: 'Por hacer', color: '#7c6cff', cards: ['Diseño de login', 'Endpoint de tareas'] },
    { name: 'En progreso', color: '#f59e0b', cards: ['Tablero Kanban'] },
    { name: 'Hecho', color: '#34d399', cards: ['Autenticación'] },
  ];

  return (
    <div className="flex h-full gap-2 p-3">
      {columns.map((col, ci) => (
        <div key={col.name} className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: col.color, transition: `all 400ms ${EASE}` }}
            />
            <span
              className="font-sans text-[0.6rem] font-medium"
              style={{ color: active ? col.color : 'rgba(255,255,255,0.35)', transition: 'color 320ms ease' }}
            >
              {col.name}
            </span>
          </div>

          {col.cards.map((card) => (
            <div
              key={card}
              className="rounded-md px-2 py-1.5 font-sans text-[0.58rem] leading-tight"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              {card}
            </div>
          ))}

          {/* La tarjeta que se mueve: sale de la columna 1 y aterriza en la 2 */}
          {ci === 1 && (
            <div
              className="rounded-md px-2 py-1.5 font-sans text-[0.58rem] leading-tight"
              style={{
                background: active ? 'rgba(52,211,153,0.14)' : 'rgba(124,108,255,0.14)',
                border: `1px solid ${active ? 'rgba(52,211,153,0.5)' : 'rgba(124,108,255,0.45)'}`,
                color: active ? '#34d399' : '#a5a0ff',
                transform: active ? 'translate(calc(100% + 8px), 26px)' : 'none',
                boxShadow: active ? '0 8px 18px rgba(0,0,0,0.45)' : 'none',
                transition: `transform 620ms ${EASE}, background 400ms ease, border-color 400ms ease, color 400ms ease, box-shadow 400ms ease`,
              }}
            >
              Permisos
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 2. Permisos por rol ───────────────────────────────────────
   Los interruptores se encienden en cascada. */
function PermissionsScene(active: boolean) {
  const permissions = [
    { name: 'canCreateTask', on: true },
    { name: 'canEditTask', on: true },
    { name: 'canDeleteTask', on: false },
    { name: 'canCreateBoard', on: true },
    { name: 'canManageMembers', on: false },
  ];

  return (
    <div className="flex h-full flex-col justify-center gap-2 px-3.5">
      {permissions.map((perm, i) => {
        const lit = active && perm.on;
        return (
          <div key={perm.name} className="flex items-center justify-between gap-2">
            <span
              className="truncate font-mono text-[0.58rem]"
              style={{
                color: lit ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
                transition: `color 300ms ease ${i * 70}ms`,
              }}
            >
              {perm.name}
            </span>
            <span
              className="relative flex-shrink-0 rounded-full"
              style={{
                width: 26,
                height: 15,
                background: lit ? '#a78bfa' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${lit ? '#a78bfa' : 'rgba(255,255,255,0.12)'}`,
                transition: `background 300ms ease ${i * 70}ms, border-color 300ms ease ${i * 70}ms`,
              }}
            >
              <span
                className="absolute rounded-full bg-white"
                style={{
                  top: 2,
                  left: 2,
                  width: 9,
                  height: 9,
                  transform: lit ? 'translateX(11px)' : 'none',
                  transition: `transform 340ms ${EASE} ${i * 70}ms`,
                }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── 3. Jerarquía de trabajo ───────────────────────────────────
   El árbol Proyecto → Espacio → Tablero se despliega por niveles. */
function HierarchyScene(active: boolean) {
  const levels = [
    { label: 'Proyecto Aurora', indent: 0, color: '#818cf8', icon: '◆' },
    { label: 'Espacio: Producto', indent: 1, color: '#a5b4fc', icon: '▸' },
    { label: 'Tablero: Sprint 4', indent: 2, color: '#c7d2fe', icon: '▪' },
    { label: 'Tablero: Backlog', indent: 2, color: '#c7d2fe', icon: '▪' },
    { label: 'Espacio: Diseño', indent: 1, color: '#a5b4fc', icon: '▸' },
  ];

  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-4">
      {levels.map((level, i) => (
        <div
          key={level.label}
          className="flex items-center gap-2"
          style={{
            paddingLeft: level.indent * 14,
            opacity: active ? 1 : 0.45,
            transform: active ? 'translateX(0)' : 'translateX(-6px)',
            transition: `opacity 340ms ease ${i * 80}ms, transform 340ms ${EASE} ${i * 80}ms`,
          }}
        >
          <span
            className="font-mono text-[0.6rem]"
            style={{ color: level.color, transition: 'color 300ms ease' }}
          >
            {level.icon}
          </span>
          <span
            className="font-sans text-[0.62rem]"
            style={{ color: active ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.42)' }}
          >
            {level.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 4. Subtareas y checklists ─────────────────────────────────
   Los ítems se marcan uno a uno y la barra de avance acompaña. */
function ChecklistScene(active: boolean) {
  const items = ['Definir el modelo de datos', 'Migraciones aplicadas', 'Endpoint documentado'];

  return (
    <div className="flex h-full flex-col justify-center gap-2.5 px-4">
      <div className="flex items-center justify-between">
        <span className="font-sans text-[0.62rem] font-medium text-white/60">Checklist</span>
        <span
          className="font-mono text-[0.58rem]"
          style={{ color: active ? '#34d399' : 'rgba(255,255,255,0.35)', transition: 'color 400ms ease 320ms' }}
        >
          {active ? '3/3' : '0/3'}
        </span>
      </div>

      <div className="h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: active ? '100%' : '0%',
            background: '#34d399',
            transition: `width 720ms ${EASE}`,
          }}
        />
      </div>

      {items.map((item, i) => (
        <div key={item} className="flex items-center gap-2">
          <span
            className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[4px] font-sans text-[0.5rem] font-bold"
            style={{
              background: active ? '#34d399' : 'transparent',
              border: `1px solid ${active ? '#34d399' : 'rgba(255,255,255,0.18)'}`,
              color: '#0d1117',
              transition: `background 260ms ease ${i * 140}ms, border-color 260ms ease ${i * 140}ms`,
            }}
          >
            <span style={{ opacity: active ? 1 : 0, transition: `opacity 200ms ease ${i * 140 + 80}ms` }}>
              ✓
            </span>
          </span>
          <span
            className="font-sans text-[0.6rem]"
            style={{
              color: active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.55)',
              textDecoration: active ? 'line-through' : 'none',
              transition: `color 260ms ease ${i * 140}ms`,
            }}
          >
            {item}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 5. Equipo y roles ─────────────────────────────────────────
   Los miembros entran escalonados y se revela su rol en el proyecto. */
function TeamScene(active: boolean) {
  const members = [
    { initials: 'AG', name: 'Andrés G.', role: 'Scrum Master', color: '#38bdf8' },
    { initials: 'JJ', name: 'Juan J.', role: 'Desarrollo', color: '#7c6cff' },
    { initials: 'CE', name: 'César E.', role: 'QA', color: '#34d399' },
  ];

  return (
    <div className="flex h-full flex-col justify-center gap-2 px-3.5">
      {members.map((member, i) => (
        <div
          key={member.initials}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
          style={{
            background: active ? 'rgba(255,255,255,0.045)' : 'transparent',
            opacity: active ? 1 : 0.5,
            transform: active ? 'translateX(0)' : 'translateX(-8px)',
            transition: `all 380ms ${EASE} ${i * 90}ms`,
          }}
        >
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-sans text-[0.55rem] font-bold"
            style={{
              background: `${member.color}22`,
              border: `1px solid ${member.color}55`,
              color: member.color,
            }}
          >
            {member.initials}
          </span>
          <span className="font-sans text-[0.62rem] text-white/70">{member.name}</span>
          <span
            className="ml-auto rounded-full px-2 py-0.5 font-sans text-[0.53rem] font-medium"
            style={{
              background: `${member.color}18`,
              color: member.color,
              opacity: active ? 1 : 0,
              transform: active ? 'scale(1)' : 'scale(0.85)',
              transition: `all 300ms ${EASE} ${i * 90 + 140}ms`,
            }}
          >
            {member.role}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 6. Control por voz ────────────────────────────────────────
   La onda de audio cobra vida y aparece la transcripción. */
function VoiceScene(active: boolean) {
  const bars = [0.3, 0.55, 0.85, 1, 0.7, 0.95, 0.5, 0.75, 1, 0.6, 0.4, 0.8, 0.55, 0.3];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
      <div className="flex h-10 items-center justify-center gap-[3px]">
        {bars.map((height, i) => (
          <span
            key={`bar-${i}-${height}`}
            className="w-[3px] rounded-full"
            style={{
              height: active ? `${height * 100}%` : '14%',
              background: active
                ? `rgba(245,158,11,${0.45 + height * 0.5})`
                : 'rgba(255,255,255,0.16)',
              transition: `height 420ms ${EASE} ${i * 32}ms, background 420ms ease ${i * 32}ms`,
            }}
          />
        ))}
      </div>

      <div
        className="rounded-full px-3 py-1.5 text-center font-sans text-[0.6rem]"
        style={{
          background: active ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${active ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.07)'}`,
          color: active ? '#f59e0b' : 'rgba(255,255,255,0.4)',
          transition: 'all 400ms ease 200ms',
        }}
      >
        «Alexa, ¿qué tareas tengo hoy?»
      </div>
    </div>
  );
}

/* ── Iconos ───────────────────────────────────────────────────── */
function icon(path: ReactNode) {
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

/* ── Datos ────────────────────────────────────────────────────── */
const CARDS: FeatureCardData[] = [
  {
    id: 1,
    accent: '#7c6cff',
    badge: 'Tableros',
    title: 'Tableros Kanban',
    description:
      'Columnas configurables por tablero. Mueve una tarea y su estado se actualiza para todo el equipo al instante.',
    icon: icon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v12a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18V6zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v6a2.25 2.25 0 01-2.25 2.25h-2.25A2.25 2.25 0 0113.5 12V6z"
      />,
    ),
    visual: KanbanScene,
  },
  {
    id: 2,
    accent: '#a78bfa',
    badge: 'Permisos',
    title: 'Permisos por rol',
    description:
      'Cada proyecto define sus propios roles y decide, permiso a permiso, quién crea, edita o elimina.',
    icon: icon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />,
    ),
    visual: PermissionsScene,
  },
  {
    id: 3,
    accent: '#818cf8',
    badge: 'Estructura',
    title: 'Espacios y tableros',
    description:
      'Una jerarquía clara para que nada quede suelto: agrupa por espacio de trabajo y divide en los tableros que hagan falta.',
    icon: icon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
      />,
    ),
    visual: HierarchyScene,
  },
  {
    id: 4,
    accent: '#34d399',
    badge: 'Detalle',
    title: 'Subtareas y checklists',
    description:
      'Divide el trabajo grande en pasos verificables. Cada tarea admite subtareas y su propia lista de comprobación.',
    icon: icon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />,
    ),
    visual: ChecklistScene,
  },
  {
    id: 5,
    accent: '#38bdf8',
    badge: 'Equipo',
    title: 'Equipo y asignaciones',
    description:
      'Invita a tu equipo, dale un rol dentro del proyecto y asigna responsables con fecha límite y prioridad.',
    icon: icon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />,
    ),
    visual: TeamScene,
  },
  {
    id: 6,
    accent: '#f59e0b',
    badge: 'Voz',
    title: 'Consulta por voz con Alexa',
    description:
      'Pregunta por el estado de un tablero o crea una tarea sin tocar el teclado, con la skill de Alexa integrada.',
    icon: icon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      />,
    ),
    visual: VoiceScene,
  },
];

/* ── Sección ──────────────────────────────────────────────────── */
export function LandingFeatures() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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

      if (gridRef.current) {
        gsap.fromTo(
          gridRef.current.querySelectorAll('.feature-card-wrapper'),
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.08,
            ease: 'power3.out',
            scrollTrigger: { trigger: gridRef.current, start: 'top 82%' },
          },
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section id="features" ref={sectionRef} className="px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <div ref={headingRef} className="mb-16 opacity-0">
          <SectionHeader
            eyebrow="Características"
            heading="Todo lo que tu equipo necesita"
            subtitle="Una plataforma que se adapta a cómo trabaja tu equipo, en lugar de obligarle a cambiar."
          />
        </div>

        <div ref={gridRef} className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <div key={card.id} className="feature-card-wrapper opacity-0">
              <FeatureCard card={card} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
