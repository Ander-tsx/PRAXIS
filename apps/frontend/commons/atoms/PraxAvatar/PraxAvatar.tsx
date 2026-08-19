'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { alpha, colors } from '../../tokens';

/**
 * Cómo se llama el asistente.
 *
 * En una constante y no escrito a mano en cada pantalla: sale en la barra
 * lateral, en la cabecera de su zona, en cada burbuja de la conversación, en el
 * panel de Análisis y en media docena de textos de ayuda. Un nombre repartido por
 * treinta literales es un nombre que no se puede cambiar.
 */
export const PRAX_NAME = 'PRAX';

/**
 * Los estados de la cara.
 *
 * No son decoración: son **la única señal de que algo está pasando** mientras el
 * modelo tarda. Un asistente que se queda con la misma cara diez segundos parece
 * colgado, y un girador genérico no dice si está pensando o si ha fallado.
 */
export type PraxMood =
  /** En reposo, esperando. */
  | 'idle'
  /** Trabajando: el modelo todavía no ha contestado. */
  | 'thinking'
  /** Contestando, o acaba de hacerlo. */
  | 'happy'
  /** Algo ha salido mal, o se agotó la cuota. */
  | 'oops';

/** Qué se dice de cada estado, para quien no ve la cara. */
const PRAX_LABELS: Record<PraxMood, string> = {
  idle: `${PRAX_NAME}, listo`,
  thinking: `${PRAX_NAME} está pensando`,
  happy: `${PRAX_NAME} ha respondido`,
  oops: `${PRAX_NAME} no ha podido`,
};

/** ASCII fallback — conservado para aria y para `PraxSidebarIcon`. */
export const PRAX_FACES: Record<PraxMood, string> = {
  idle: '^-^',
  thinking: 'o_o',
  happy: '^o^',
  oops: '>_<',
};

export type PraxSize = 'xs' | 'sm' | 'md' | 'lg';

const MEDIDAS: Record<PraxSize, { px: number; caja: string }> = {
  xs: { px: 20, caja: 'h-5 w-5' },
  sm: { px: 28, caja: 'h-7 w-7' },
  md: { px: 40, caja: 'h-10 w-10' },
  lg: { px: 80, caja: 'h-20 w-20' },
};

export interface PraxAvatarProps {
  mood?: PraxMood;
  size?: PraxSize;
  className?: string;
  /** Desactiva las animaciones de parpadeo y mirada. */
  animate?: boolean;
}

/* ─── Geometría ───────────────────────────────────────────────────────────
 *
 * Todo es cuadrado. Los ojos son rectángulos. Las expresiones se hacen
 * cambiando la forma de esos rectángulos o sustituyéndolos por chevrones.
 * Estilo pixel-art / Claude Code crab: blocky, geométrico, sin curvas
 * orgánicas.
 *
 * viewBox = 100×100. El cuerpo es un rect redondeado que ocupa casi todo.
 * ──────────────────────────────────────────────────────────────────────── */

const LEFT_EYE_X = 27;
const RIGHT_EYE_X = 59;
const EYE_Y = 38;
const EYE_W = 14;
const EYE_H = 14;

/* ─── Tipos de mirada ─────────────────────────────────────────────────── */

type LookDir = 'center' | 'left' | 'right';

/**
 * La cara de PRAX — versión pixel-art.
 *
 * Un cuadrado redondeado con el degradado de la marca y dos ojos geométricos
 * que cambian de forma según el mood:
 *
 * - **idle**: dos cuadrados negros, mirada relajada
 * - **thinking**: ojos entrecerrados (rectángulos horizontales estrechos),
 *   con un ligero vaivén
 * - **happy**: chevrones `^ ^` apuntando arriba, ojos sonrientes
 * - **oops**: chevrones `> <` apretados, estilo >_<
 *
 * Los ojos parpadean (se aplanan a una línea horizontal) y miran a los lados
 * de vez en cuando. Todo es recto, blocky, sin redondeces orgánicas.
 */
export function PraxAvatar({
  mood = 'idle',
  size = 'md',
  className = '',
  animate = true,
}: PraxAvatarProps) {
  const medidas = MEDIDAS[size];
  const canAnimate = animate && size !== 'xs';

  /* ── Estado de animación ────────────────────────────────────────────── */
  const [blinking, setBlinking] = useState(false);
  const [lookDir, setLookDir] = useState<LookDir>('center');
  const blinkTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const lookTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  /* ── Parpadeo ───────────────────────────────────────────────────────── */
  const scheduleBlink = useCallback(() => {
    if (!canAnimate) return;
    const delay = 2200 + Math.random() * 3800;
    blinkTimeout.current = setTimeout(() => {
      setBlinking(true);
      setTimeout(() => {
        setBlinking(false);
        /* Doble parpadeo ocasional. */
        if (Math.random() < 0.2) {
          setTimeout(() => {
            setBlinking(true);
            setTimeout(() => setBlinking(false), 90);
          }, 160);
        }
      }, 100);
      scheduleBlink();
    }, delay);
  }, [canAnimate]);

  useEffect(() => {
    scheduleBlink();
    return () => { if (blinkTimeout.current) clearTimeout(blinkTimeout.current); };
  }, [scheduleBlink]);

  /* ── Mirada ─────────────────────────────────────────────────────────── */
  const scheduleLook = useCallback(() => {
    if (!canAnimate) return;
    const delay = 3500 + Math.random() * 5000;
    lookTimeout.current = setTimeout(() => {
      const dirs: LookDir[] = ['left', 'right'];
      const picked = dirs[Math.floor(Math.random() * dirs.length)] ?? 'left';
      setLookDir(picked);
      setTimeout(() => setLookDir('center'), 500 + Math.random() * 700);
      scheduleLook();
    }, delay);
  }, [canAnimate]);

  useEffect(() => {
    scheduleLook();
    return () => { if (lookTimeout.current) clearTimeout(lookTimeout.current); };
  }, [scheduleLook]);

  /* ── Offset de mirada (desplaza los ojos lateralmente) ──────────────── */
  const lookOffset = mood === 'thinking' ? 0 : lookDir === 'left' ? -3 : lookDir === 'right' ? 3 : 0;

  /* ── Renderizar ojos según mood ─────────────────────────────────────── */
  const renderEyes = () => {
    const lx = LEFT_EYE_X + lookOffset;
    const rx = RIGHT_EYE_X + lookOffset;
    const transition = 'all 200ms ease-out';

    /* Parpadeo: aplana los ojos a una línea horizontal delgada. */
    if (blinking && (mood === 'idle' || mood === 'thinking')) {
      return (
        <g>
          <rect x={lx} y={EYE_Y + 5} width={EYE_W} height={3} fill={colors.primaryForeground} style={{ transition }} />
          <rect x={rx} y={EYE_Y + 5} width={EYE_W} height={3} fill={colors.primaryForeground} style={{ transition }} />
        </g>
      );
    }

    switch (mood) {
      /* ── Idle: dos cuadrados sólidos ──────────────────────────────── */
      case 'idle':
        return (
          <g>
            <rect x={lx} y={EYE_Y} width={EYE_W} height={EYE_H} fill={colors.primaryForeground} style={{ transition }} />
            <rect x={rx} y={EYE_Y} width={EYE_W} height={EYE_H} fill={colors.primaryForeground} style={{ transition }} />
          </g>
        );

      /* ── Thinking: rectángulos estrechos horizontales (entrecerrados) ── */
      case 'thinking':
        return (
          <g>
            <rect x={lx} y={EYE_Y + 3} width={EYE_W} height={7} fill={colors.primaryForeground} style={{ transition }}>
              {canAnimate && (
                <animate attributeName="y" values={`${EYE_Y + 3};${EYE_Y + 5};${EYE_Y + 3}`} dur="2s" repeatCount="indefinite" />
              )}
            </rect>
            <rect x={rx} y={EYE_Y + 3} width={EYE_W} height={7} fill={colors.primaryForeground} style={{ transition }}>
              {canAnimate && (
                <animate attributeName="y" values={`${EYE_Y + 3};${EYE_Y + 5};${EYE_Y + 3}`} dur="2s" repeatCount="indefinite" />
              )}
            </rect>
          </g>
        );

      /* ── Happy: chevrones ^ ^ apuntando arriba ───────────────────── */
      case 'happy': {
        const lCx = LEFT_EYE_X + EYE_W / 2;
        const rCx = RIGHT_EYE_X + EYE_W / 2;
        const cy = EYE_Y + EYE_H / 2;
        const half = 7;
        return (
          <g
            stroke={colors.primaryForeground}
            strokeWidth="3.5"
            strokeLinecap="square"
            fill="none"
          >
            {/* ^ izquierdo */}
            <polyline points={`${lCx - half},${cy + 3} ${lCx},${cy - 4} ${lCx + half},${cy + 3}`} />
            {/* ^ derecho */}
            <polyline points={`${rCx - half},${cy + 3} ${rCx},${cy - 4} ${rCx + half},${cy + 3}`} />
          </g>
        );
      }

      /* ── Oops: chevrones > < apretados ───────────────────────────── */
      case 'oops': {
        const lCx = LEFT_EYE_X + EYE_W / 2;
        const rCx = RIGHT_EYE_X + EYE_W / 2;
        const cy = EYE_Y + EYE_H / 2;
        const half = 6;
        return (
          <g
            stroke={colors.primaryForeground}
            strokeWidth="3.5"
            strokeLinecap="square"
            fill="none"
          >
            {/* > izquierdo */}
            <polyline points={`${lCx - half},${cy - half} ${lCx + half},${cy} ${lCx - half},${cy + half}`} />
            {/* < derecho */}
            <polyline points={`${rCx + half},${cy - half} ${rCx - half},${cy} ${rCx + half},${cy + half}`} />
          </g>
        );
      }
    }
  };

  /* ── Boca (solo en md y lg, y solo para algunos moods) ──────────────── */
  const renderMouth = () => {
    if (size === 'xs' || size === 'sm') return null;

    switch (mood) {
      case 'idle':
        /* Sin boca en idle: la expresión la llevan los ojos. */
        return null;

      case 'thinking':
        /* Punto pequeño de concentración. */
        return (
          <rect x={46} y={62} width={8} height={4} rx={0} fill={colors.primaryForeground} opacity={0.6} />
        );

      case 'happy':
        /* Línea ancha de sonrisa. */
        return (
          <rect x={38} y={62} width={24} height={3} fill={colors.primaryForeground} opacity={0.7} />
        );

      case 'oops':
        /* Boquita cuadrada pequeña. */
        return (
          <rect
            x={44} y={60} width={12} height={8}
            fill="none"
            stroke={colors.primaryForeground}
            strokeWidth="2.5"
            opacity={0.7}
          />
        );
    }
  };

  return (
    <span
      role="img"
      aria-label={PRAX_LABELS[mood]}
      title={PRAX_LABELS[mood]}
      className={`inline-flex shrink-0 select-none items-center justify-center ${medidas.caja} ${className}`}
      style={{
        animation: canAnimate && (mood === 'idle' || mood === 'happy')
          ? 'prax-float 3s ease-in-out infinite'
          : undefined,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={medidas.px}
        height={medidas.px}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="prax-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors.primary} />
            <stop offset="100%" stopColor={colors.primaryHover} />
          </linearGradient>
        </defs>

        {/* ── Cuerpo ────────────────────────────────────────────────── */}
        <rect
          x="4" y="4" width="92" height="92"
          rx="22" ry="22"
          fill="url(#prax-grad)"
          stroke={alpha(colors.primary, 30)}
          strokeWidth="1.5"
        />

        {/* ── Ojos ──────────────────────────────────────────────────── */}
        {renderEyes()}

        {/* ── Boca ──────────────────────────────────────────────────── */}
        {renderMouth()}

        {/* ── Accesorios reactivos (solo md/lg) ─────────────────────── */}

        {/* Thinking: tres puntos parpadeantes debajo */}
        {mood === 'thinking' && canAnimate && size !== 'sm' && (
          <g fill={colors.primaryForeground} opacity={0.4}>
            {[0, 1, 2].map((i) => (
              <rect key={i} x={40 + i * 10} y={78} width={4} height={4}>
                <animate
                  attributeName="opacity"
                  values="0.2;0.8;0.2"
                  dur="1.2s"
                  begin={`${i * 0.3}s`}
                  repeatCount="indefinite"
                />
              </rect>
            ))}
          </g>
        )}

        {/* Oops: gota cuadrada (pixel-art) */}
        {mood === 'oops' && size !== 'xs' && size !== 'sm' && (
          <g fill={colors.primaryForeground} opacity={0.5}>
            <rect x={82} y={24} width={4} height={4} />
            <rect x={80} y={28} width={8} height={4} />
            <rect x={80} y={32} width={8} height={4} />
            <rect x={82} y={36} width={4} height={4} />
            {canAnimate && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0,0; 0,4; 0,0"
                dur="1.5s"
                repeatCount="indefinite"
              />
            )}
          </g>
        )}
      </svg>

      <style>{`
        @keyframes prax-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label^="PRAX"] { animation: none !important; }
        }
      `}</style>
    </span>
  );
}
