'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FeatureCard, type FeatureCardData, SectionHeader } from '@praxis/commons';

/* ── Feature overlay components (internal to this organism) ── */

function KanbanOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col pointer-events-none" style={{ paddingTop: 56 }}>
      <div className="flex gap-2 px-5 pb-3" style={{ height: 110 }}>
        {[
          {
            label: 'Por hacer',
            cards: ['Diseño UI', 'API auth'],
            bg: 'rgba(124,108,255,0.08)',
            labelColor: '#7c6cff',
          },
          {
            label: 'En progreso',
            cards: ['Kanban ✦'],
            bg: 'rgba(245,158,11,0.08)',
            labelColor: '#f59e0b',
          },
          {
            label: 'Listo',
            cards: ['Auth', 'Setup'],
            bg: 'rgba(52,211,153,0.08)',
            labelColor: '#34d399',
          },
        ].map((col, ci) => (
          <div
            key={ci}
            className="flex-1 rounded-lg p-2 flex flex-col gap-1"
            style={{ background: col.bg, border: '1px solid rgba(255,255,255,0.04)' }}
          >
            <span className="font-sans font-medium" style={{ fontSize: 9, color: col.labelColor }}>
              {col.label}
            </span>
            {col.cards.map((card, i) => (
              <div
                key={i}
                className="px-2 py-1 rounded font-sans"
                style={{
                  fontSize: 9,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.5)',
                  animation: ci === 1 ? 'kanban-slide 2.5s ease-in-out infinite' : undefined,
                }}
              >
                {card}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="px-5 flex gap-2 flex-wrap">
        {[
          { label: 'Drag & drop activo', color: '#7c6cff' },
          { label: '5 tareas total', color: '#34d399' },
        ].map((p) => (
          <span
            key={p.label}
            className="font-sans font-medium"
            style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 20,
              border: `1px solid ${p.color}50`,
              background: `${p.color}15`,
              color: p.color,
            }}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PermissionOverlay() {
  const perms = [
    { name: 'proyecto:crear', on: true },
    { name: 'proyecto:cerrar', on: false },
    { name: 'tarea:crear', on: true },
    { name: 'tarea:mover', on: true },
    { name: 'costos:ver', on: false },
    { name: 'admin:panel', on: false },
    { name: 'bitácora:ver', on: true },
  ];
  return (
    <div
      className="absolute inset-0 px-5 pb-4 flex flex-col gap-1.5 pointer-events-none"
      style={{ paddingTop: 56 }}
    >
      {perms.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <span
            className="font-mono truncate"
            style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}
          >
            {p.name}
          </span>
          <div
            style={{
              width: 24,
              height: 14,
              borderRadius: 7,
              flexShrink: 0,
              background: p.on ? '#a78bfa' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${p.on ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#fff',
                transform: p.on ? 'translateX(10px)' : 'none',
                transition: 'transform 0.25s cubic-bezier(.34,1.56,.64,1)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportOverlay() {
  return (
    <div
      className="absolute inset-0 px-5 pb-4 flex flex-col gap-2 pointer-events-none"
      style={{ paddingTop: 56 }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Desviación vs. Estimado</span>
        <span style={{ fontSize: 9, color: '#f87171', fontWeight: 600 }}>+14% sobre estimado</span>
      </div>
      <svg viewBox="0 0 220 72" style={{ width: '100%', height: 72 }}>
        {[18, 36, 54].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="220"
            y2={y}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}
        <polyline
          points="0,62 44,48 88,38 132,30 176,22 220,16"
          fill="none"
          stroke="rgba(129,140,248,0.45)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <polyline
          points="0,62 44,56 88,52 132,42 176,36 220,44"
          fill="none"
          stroke="#f87171"
          strokeWidth="2"
        />
        <circle cx="220" cy="44" r="3" fill="#f87171" />
        {['S1', 'S2', 'S3', 'S4', 'S5'].map((l, i) => (
          <text
            key={l}
            x={i * 44 + 4}
            y="70"
            fill="rgba(154,160,180,0.4)"
            fontSize="7"
            fontFamily="monospace"
          >
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}

function CostOverlay() {
  const [count, setCount] = useState(0);
  const TARGET = 47832;

  useEffect(() => {
    let val = 0;
    const interval = setInterval(() => {
      val += Math.ceil(TARGET / 35);
      if (val >= TARGET) {
        val = TARGET;
        clearInterval(interval);
      }
      setCount(val);
    }, 28);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="absolute inset-0 px-5 pb-4 flex flex-col gap-2 pointer-events-none"
      style={{ paddingTop: 56 }}
    >
      <div
        style={{
          fontSize: '1.4rem',
          fontWeight: 600,
          color: '#f0f0f5',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        ${count.toLocaleString()}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: -4 }}>
        de $65,000 presupuestados
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          marginTop: 4,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', width: '73%', borderRadius: 2, background: '#34d399' }} />
      </div>
      <div className="flex justify-between">
        <span style={{ fontSize: 9, color: '#34d399' }}>73% ejecutado</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Restan $17,168</span>
      </div>
    </div>
  );
}

function TeamOverlay() {
  const nodes = [
    { x: 100, y: 55, r: 9, label: 'PM', color: '#38bdf8', textColor: '#0d1117', delay: '0.1s' },
    { x: 45, y: 28, r: 6, label: 'Dev', color: '#7c6cff', textColor: '#fff', delay: '0.25s' },
    { x: 155, y: 28, r: 6, label: 'UI', color: '#a78bfa', textColor: '#fff', delay: '0.32s' },
    { x: 25, y: 82, r: 5.5, label: 'QA', color: '#38bdf8', textColor: '#0d1117', delay: '0.38s' },
    { x: 175, y: 82, r: 5.5, label: 'Ops', color: '#34d399', textColor: '#0d1117', delay: '0.45s' },
    { x: 100, y: 105, r: 5.5, label: 'DB', color: '#f59e0b', textColor: '#0d1117', delay: '0.52s' },
  ];
  const edges = [
    [100, 55, 45, 28],
    [100, 55, 155, 28],
    [100, 55, 25, 82],
    [100, 55, 175, 82],
    [100, 55, 100, 105],
  ];

  return (
    <div
      className="absolute inset-0 px-5 pb-3 flex flex-col pointer-events-none"
      style={{ paddingTop: 56 }}
    >
      <svg viewBox="0 20 200 95" style={{ width: '100%', height: 90 }}>
        {edges.map(([x1, y1, x2, y2], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(56,189,248,0.2)"
            strokeWidth="1"
          />
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={n.r + 4} fill={n.color} opacity={0.15} />
            <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} />
            <text
              x={n.x}
              y={n.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={n.textColor}
              fontSize={n.r > 7 ? 6 : 5}
              fontFamily="system-ui"
              fontWeight="600"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex gap-1.5 flex-wrap mt-1">
        {nodes.map((n) => (
          <span
            key={n.label}
            className="font-sans font-medium"
            style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 20,
              border: `1px solid ${n.color}40`,
              background: `${n.color}15`,
              color: n.color,
            }}
          >
            {n.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LogOverlay() {
  const events = [
    { time: '09:42', user: 'Andres G.', action: 'Creó el proyecto Alpha', color: '#7c6cff' },
    { time: '10:15', user: 'Juan J.', action: 'Movió tarea a En Progreso', color: '#f59e0b' },
    { time: '11:03', user: 'Cesar E.', action: 'Desplegó módulo auth', color: '#34d399' },
    { time: '11:48', user: 'Angel S.', action: 'Actualizó estimación', color: '#38bdf8' },
    { time: '12:30', user: 'Erick T.', action: 'Generó reporte PDF', color: '#a78bfa' },
  ];
  return (
    <div
      className="absolute inset-0 px-5 pb-4 flex flex-col gap-0 pointer-events-none"
      style={{ paddingTop: 56 }}
    >
      <div className="flex flex-col gap-1.5">
        {events.map((ev, i) => (
          <div key={i} className="flex items-start gap-2">
            <span
              className="font-mono flex-shrink-0"
              style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', paddingTop: 1 }}
            >
              {ev.time}
            </span>
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: ev.color,
                marginTop: 3,
                flexShrink: 0,
              }}
            />
            <div className="flex flex-col">
              <span className="font-sans font-semibold" style={{ fontSize: 10, color: ev.color }}>
                {ev.user}
              </span>
              <span className="font-sans" style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                {ev.action}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#34d399',
            display: 'inline-block',
            animation: 'blink 0.9s ease infinite alternate',
          }}
        />
        <span className="font-sans" style={{ fontSize: 10, color: '#34d399' }}>
          En vivo
        </span>
      </div>
    </div>
  );
}

/* ── Card data ─────────────────────────────────────────────── */
function makeIcon(path: ReactNode) {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const CARDS: FeatureCardData[] = [
  {
    id: 1,
    icon: makeIcon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />,
    ),
    title: 'Tablero Kanban',
    description:
      'Visualiza el flujo de trabajo con drag & drop. Columnas To Do, Doing y Done en tiempo real.',
    badge: 'Ciclo 2',
    overlay: <KanbanOverlay />,
    accent: '#7c6cff',
  },
  {
    id: 2,
    icon: makeIcon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12 1.733 0 3.384-.367 4.879-1.028M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
      />,
    ),
    title: 'Permisos dinámicos',
    description:
      'Sistema granular por módulo y acción. Define exactamente qué puede ver y hacer cada usuario.',
    badge: 'Ciclo 1',
    overlay: <PermissionOverlay />,
    accent: '#a78bfa',
  },
  {
    id: 3,
    icon: makeIcon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
      />,
    ),
    title: 'Reportes de desviación',
    description:
      'Compara estimaciones vs. ejecución real. Detecta desvíos de tiempo y costo antes de que escalen.',
    badge: 'Ciclo 4',
    overlay: <ReportOverlay />,
    accent: '#818cf8',
  },
  {
    id: 4,
    icon: makeIcon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />,
    ),
    title: 'Control de costos',
    description:
      'Presupuesto, costo por hora y gasto acumulado por tarea. Visibilidad financiera en tiempo real.',
    badge: 'Ciclo 3',
    overlay: <CostOverlay />,
    accent: '#34d399',
  },
  {
    id: 5,
    icon: makeIcon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />,
    ),
    title: 'Gestión de equipos',
    description:
      'Crea proyectos, asigna responsables y monitorea el avance de cada miembro del equipo.',
    badge: 'Ciclo 1',
    overlay: <TeamOverlay />,
    accent: '#38bdf8',
  },
  {
    id: 6,
    icon: makeIcon(
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
      />,
    ),
    title: 'Bitácora de actividad',
    description:
      'Registro inmutable de quién hizo qué y cuándo. Auditoría completa con trazabilidad total.',
    badge: 'Ciclo 4',
    overlay: <LogOverlay />,
    accent: '#f59e0b',
  },
];

/* Inject feature-specific keyframes */
const FEATURE_KEYFRAMES = `
  @keyframes blink { to { opacity: 0.2; } }
`;

/* ── Section ──────────────────────────────────────────────── */
export function LandingFeatures() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = FEATURE_KEYFRAMES;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

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
        const cards = gridRef.current.querySelectorAll('.feature-card-wrapper');
        gsap.fromTo(
          cards,
          { y: 50, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.08,
            ease: 'power3.out',
            scrollTrigger: { trigger: gridRef.current, start: 'top 80%' },
          },
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section id="features" ref={sectionRef} className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div ref={headingRef} className="mb-16 opacity-0">
          <SectionHeader
            eyebrow="Características"
            heading="Todo lo que tu equipo necesita"
            subtitle="Construido módulo a módulo para que cada funcionalidad esté pulida antes de agregar la siguiente."
          />
        </div>

        <div
          ref={gridRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          style={{ overflow: 'visible' }}
        >
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
