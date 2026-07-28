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
   Al pasar el cursor, la tarea se arrastra de "En progreso" a "Hecho":
   se inclina, se eleva y aterriza en la columna destino. */
function KanbanScene(active: boolean) {
  const columns = [
    {
      name: 'Por hacer',
      color: '#7c6cff',
      tasks: [
        { title: 'Diseño de login', due: '4 mar' },
        { title: 'Endpoint tareas', due: '6 mar' },
      ],
    },
    { name: 'En progreso', color: '#f59e0b', tasks: [{ title: 'Filtros', due: '8 mar' }] },
    { name: 'Hecho', color: '#34d399', tasks: [{ title: 'Autenticación', due: '1 mar' }] },
  ];

  const card = (title: string, due: string, tone?: string) => (
    <div
      className="rounded-lg px-2 py-1.5"
      style={{
        background: tone ? `${tone}1c` : 'rgba(255,255,255,0.05)',
        border: `1px solid ${tone ? `${tone}55` : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <div
        className="truncate font-sans text-[0.58rem] leading-tight"
        style={{ color: tone ?? 'rgba(255,255,255,0.62)' }}
      >
        {title}
      </div>
      <div className="mt-1 flex items-center gap-1">
        <svg
          className="h-2 w-2 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          style={{ color: 'rgba(255,255,255,0.3)' }}
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
        <span className="font-mono text-[0.5rem]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {due}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex h-full gap-2.5 p-3.5">
      {columns.map((col, ci) => (
        <div key={col.name} className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: col.color }} />
            <span
              className="truncate font-sans text-[0.58rem] font-medium"
              style={{
                color: active ? col.color : 'rgba(255,255,255,0.4)',
                transition: 'color 320ms ease',
              }}
            >
              {col.name}
            </span>
          </div>

          {col.tasks.map((task) => (
            <div key={task.title}>{card(task.title, task.due)}</div>
          ))}

          {/* La tarea arrastrada: vive en "En progreso" y aterriza en "Hecho" */}
          {ci === 1 && (
            <div
              style={{
                transform: active
                  ? 'translate(calc(100% + 10px), 26px) rotate(0deg) scale(1)'
                  : 'translate(0, 0) rotate(0deg) scale(1)',
                filter: active
                  ? 'drop-shadow(0 10px 16px rgba(0,0,0,0.55))'
                  : 'drop-shadow(0 0 0 rgba(0,0,0,0))',
                transition: `transform 700ms ${EASE}, filter 500ms ease`,
                animation: active ? 'kanban-tilt 700ms ease-in-out' : undefined,
              }}
            >
              {card('Permisos por rol', '11 mar', active ? '#34d399' : '#a5a0ff')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 2. Permisos por rol ───────────────────────────────────────
   El rol activo cambia y la retícula de los 10 permisos del proyecto
   se enciende en cascada: un rol es un conjunto de permisos, no
   una fila de interruptores sueltos. */
const PROJECT_PERMISSIONS = [
  { code: 'Tarea+', full: 'canCreateTask' },
  { code: 'Tarea~', full: 'canEditTask' },
  { code: 'Tarea−', full: 'canDeleteTask' },
  { code: 'Tabl+', full: 'canCreateBoard' },
  { code: 'Tabl~', full: 'canEditBoard' },
  { code: 'Tabl−', full: 'canDeleteBoard' },
  { code: 'Col+', full: 'canCreateColumn' },
  { code: 'Col−', full: 'canDeleteColumn' },
  { code: 'Miemb', full: 'canManageMembers' },
  { code: 'Roles', full: 'canManageRoles' },
];

/** Índices que tiene cada rol; el hover pasa de Desarrollo a Scrum Master. */
const ROLE_GRANTS = {
  desarrollo: [0, 1, 4, 6],
  scrumMaster: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
};

function PermissionsScene(active: boolean) {
  const granted = active ? ROLE_GRANTS.scrumMaster : ROLE_GRANTS.desarrollo;
  const roles = [
    { name: 'Desarrollo', on: !active },
    { name: 'Scrum Master', on: active },
  ];

  return (
    <div className="flex h-full flex-col justify-center gap-2.5 px-3.5">
      {/* Selector de rol */}
      <div className="flex items-center gap-1.5">
        {roles.map((role) => (
          <span
            key={role.name}
            className="rounded-full px-2 py-0.5 font-sans text-[0.55rem] font-medium"
            style={{
              background: role.on ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${role.on ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.07)'}`,
              color: role.on ? '#c4b5fd' : 'rgba(255,255,255,0.3)',
              transition: 'all 320ms ease',
            }}
          >
            {role.name}
          </span>
        ))}
        <span
          className="ml-auto font-mono text-[0.52rem]"
          style={{ color: 'rgba(255,255,255,0.35)', transition: 'color 320ms ease' }}
        >
          {granted.length}/10
        </span>
      </div>

      {/* Retícula de permisos */}
      <div className="grid grid-cols-5 gap-1">
        {PROJECT_PERMISSIONS.map((permission, i) => {
          const on = granted.includes(i);
          return (
            <span
              key={permission.full}
              title={permission.full}
              className="flex items-center justify-center rounded-md py-1 font-sans text-[0.45rem] font-medium"
              style={{
                background: on ? 'rgba(167,139,250,0.22)' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${on ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.06)'}`,
                color: on ? '#ddd6fe' : 'rgba(255,255,255,0.22)',
                transform: on ? 'scale(1)' : 'scale(0.94)',
                transition: `all 300ms ${EASE} ${i * 45}ms`,
              }}
            >
              {permission.code}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── 3. Espacios y tableros ────────────────────────────────────
   Árbol invertido: el proyecto arriba, sus espacios debajo y los
   tableros colgando de cada espacio. Las ramas se trazan al pasar. */
function HierarchyScene(active: boolean) {
  const branches = [
    { x1: 150, y1: 34, x2: 78, y2: 62 },
    { x1: 150, y1: 34, x2: 222, y2: 62 },
    { x1: 78, y1: 82, x2: 42, y2: 110 },
    { x1: 78, y1: 82, x2: 114, y2: 110 },
    { x1: 222, y1: 82, x2: 186, y2: 110 },
    { x1: 222, y1: 82, x2: 258, y2: 110 },
  ];

  const nodes = [
    { x: 150, y: 24, w: 92, label: 'Proyecto Aurora', color: '#818cf8', level: 0 },
    { x: 78, y: 72, w: 74, label: 'Producto', color: '#a5b4fc', level: 1 },
    { x: 222, y: 72, w: 74, label: 'Diseño', color: '#a5b4fc', level: 1 },
    { x: 42, y: 120, w: 62, label: 'Sprint 4', color: '#c7d2fe', level: 2 },
    { x: 114, y: 120, w: 62, label: 'Backlog', color: '#c7d2fe', level: 2 },
    { x: 186, y: 120, w: 62, label: 'UI Kit', color: '#c7d2fe', level: 2 },
    { x: 258, y: 120, w: 62, label: 'Research', color: '#c7d2fe', level: 2 },
  ];

  return (
    <div className="flex h-full items-center justify-center px-3">
      <svg viewBox="0 0 300 144" className="h-full w-full" role="img" aria-label="Jerarquía de proyecto">
        <title>Proyecto, espacios y tableros</title>

        {branches.map((branch, i) => (
          <path
            key={`${branch.x1}-${branch.y1}-${branch.x2}-${branch.y2}`}
            d={`M ${branch.x1} ${branch.y1} C ${branch.x1} ${(branch.y1 + branch.y2) / 2}, ${branch.x2} ${(branch.y1 + branch.y2) / 2}, ${branch.x2} ${branch.y2}`}
            fill="none"
            stroke={active ? 'rgba(129,140,248,0.65)' : 'rgba(129,140,248,0.2)'}
            strokeWidth="1.2"
            strokeDasharray="60"
            strokeDashoffset={active ? 0 : 60}
            style={{
              transition: `stroke-dashoffset 520ms ${EASE} ${i < 2 ? 0 : 220}ms, stroke 400ms ease`,
            }}
          />
        ))}

        {nodes.map((node) => (
          <g
            key={node.label}
            style={{
              opacity: active || node.level === 0 ? 1 : 0.4,
              transition: `opacity 380ms ease ${node.level * 180}ms`,
            }}
          >
            <rect
              x={node.x - node.w / 2}
              y={node.y - 9}
              width={node.w}
              height={18}
              rx={5}
              fill={active ? `${node.color}20` : 'rgba(255,255,255,0.04)'}
              stroke={active ? `${node.color}70` : 'rgba(255,255,255,0.08)'}
              strokeWidth="1"
              style={{ transition: 'all 380ms ease' }}
            />
            <text
              x={node.x}
              y={node.y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="7.5"
              fontFamily="system-ui, sans-serif"
              fill={active ? node.color : 'rgba(255,255,255,0.45)'}
              style={{ transition: 'fill 380ms ease' }}
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
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
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.7}
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
