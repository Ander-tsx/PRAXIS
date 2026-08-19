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

/** ASCII fallback — conservado para `PraxSidebarIcon` y aria. */
export const PRAX_FACES: Record<PraxMood, string> = {
  idle: '^-^',
  thinking: 'o_o',
  happy: '^o^',
  oops: '>_<',
};

export type PraxSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Dimensiones en píxeles para el SVG viewBox scaling.
 *
 * No son clases de Tailwind porque el SVG necesita números reales para
 * calcular proporciones internas. La caja CSS sí usa las clases para que
 * encaje en el layout de Tailwind sin conflictos.
 */
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
  /** Desactiva las animaciones de parpadeo y mirada. `true` por defecto. */
  animate?: boolean;
}

/* ─── Geometría de los ojos ───────────────────────────────────────────────── */

/** Ojo izquierdo y derecho, en un viewBox de 100×100. */
const LEFT_EYE_CX = 35;
const RIGHT_EYE_CX = 65;
const EYE_CY = 44;
const EYE_RX = 7;
const EYE_RY = 8;

/** Pupila. */
const PUPIL_R = 3.5;

/** Cuánto se desplaza la pupila al mirar a un lado. */
const LOOK_OFFSET = 3;

/** Brillo del ojo — un círculo blanco pequeño. */
const GLINT_R = 1.6;
const GLINT_OFFSET_X = -2;
const GLINT_OFFSET_Y = -2.5;

/* ─── Boca ────────────────────────────────────────────────────────────────── */

/** Una curvita centrada debajo de los ojos. */
const MOUTH_Y = 60;

/* ─── Animaciones ─────────────────────────────────────────────────────────── */

type LookDir = 'center' | 'left' | 'right' | 'up';

/**
 * La cara de PRAX.
 *
 * ## Rediseño: de ASCII a mascota animada
 *
 * La versión anterior era un cuadrado redondeado con tres caracteres ASCII
 * (`^-^`, `o_o`, etc.). Cumplía su función de señal de estado, pero carecía
 * de la personalidad que un asistente con nombre propio merece.
 *
 * Esta versión es un SVG con la misma forma exterior —cuadrado redondeado con
 * el degradado de la marca— pero con ojos y boca dibujados que:
 *
 * 1. **Parpadean** a intervalos semi-aleatorios (2–5s), con doble parpadeo
 *    ocasional para darle naturalidad.
 * 2. **Miran alrededor** de vez en cuando (izquierda, derecha, arriba),
 *    como si estuvieran pensando o curioseando.
 * 3. **Reaccionan al mood**: los ojos se achican felices (`happy`), giran
 *    buscando (`thinking`), o se aprietan incómodos (`oops`).
 * 4. **Flotan suavemente** con un `translateY` sinusoidal en idle.
 *
 * Es un componente **de cliente** porque necesita `useEffect` para los
 * temporizadores de parpadeo y mirada. El coste es mínimo: un SVG inline
 * sin dependencias externas.
 */
export function PraxAvatar({
  mood = 'idle',
  size = 'md',
  className = '',
  animate = true,
}: PraxAvatarProps) {
  const medidas = MEDIDAS[size];
  const canAnimate = animate && size !== 'xs';

  /* ── Estado de la cara ──────────────────────────────────────────────── */
  const [blinking, setBlinking] = useState(false);
  const [lookDir, setLookDir] = useState<LookDir>('center');
  const blinkTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const lookTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const prevMoodRef = useRef<PraxMood>(mood);
  const [reacting, setReacting] = useState(false);

  /* Flash de reacción al cambiar de mood. */
  useEffect(() => {
    if (prevMoodRef.current !== mood) {
      prevMoodRef.current = mood;
      setReacting(true);
      const t = setTimeout(() => setReacting(false), 600);
      return () => clearTimeout(t);
    }
  }, [mood]);

  /* ── Parpadeo ───────────────────────────────────────────────────────── */
  const scheduleBlink = useCallback(() => {
    if (!canAnimate) return;
    const delay = 2000 + Math.random() * 3500;
    blinkTimeout.current = setTimeout(() => {
      setBlinking(true);
      /* Duración del parpadeo: ~120ms. */
      setTimeout(() => {
        setBlinking(false);
        /* Doble parpadeo 25% del tiempo. */
        if (Math.random() < 0.25) {
          setTimeout(() => {
            setBlinking(true);
            setTimeout(() => setBlinking(false), 100);
          }, 180);
        }
      }, 120);
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
    const delay = 3000 + Math.random() * 5000;
    lookTimeout.current = setTimeout(() => {
      const dirs: LookDir[] = ['left', 'right', 'up'];
      const picked = dirs[Math.floor(Math.random() * dirs.length)] ?? 'left';
      setLookDir(picked);
      /* Mantiene la mirada 0.6–1.4s y vuelve al centro. */
      setTimeout(() => {
        setLookDir('center');
      }, 600 + Math.random() * 800);
      scheduleLook();
    }, delay);
  }, [canAnimate]);

  useEffect(() => {
    scheduleLook();
    return () => { if (lookTimeout.current) clearTimeout(lookTimeout.current); };
  }, [scheduleLook]);

  /* ── Cálculos derivados ─────────────────────────────────────────────── */

  const pupilOffset = (() => {
    if (mood === 'thinking') return { x: 0, y: -1 };
    switch (lookDir) {
      case 'left': return { x: -LOOK_OFFSET, y: 0 };
      case 'right': return { x: LOOK_OFFSET, y: 0 };
      case 'up': return { x: 0, y: -LOOK_OFFSET };
      default: return { x: 0, y: 0 };
    }
  })();

  const isSmall = size === 'xs' || size === 'sm';

  return (
    <span
      role="img"
      aria-label={PRAX_LABELS[mood]}
      title={PRAX_LABELS[mood]}
      className={`inline-flex shrink-0 select-none items-center justify-center ${medidas.caja} ${className}`}
      style={{
        /* Flotación suave en idle/happy, solo en tamaños grandes. */
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
          <linearGradient id="prax-shine" x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.18" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ── Cuerpo ────────────────────────────────────────────────── */}
        <rect
          x="4" y="4" width="92" height="92"
          rx="28" ry="28"
          fill="url(#prax-grad)"
          stroke={alpha(colors.primary, 30)}
          strokeWidth="1.5"
        />
        {/* Brillo sutil en la esquina superior izquierda. */}
        <rect
          x="4" y="4" width="92" height="92"
          rx="28" ry="28"
          fill="url(#prax-shine)"
        />

        {/* ── Ojos ──────────────────────────────────────────────────── */}
        {mood === 'oops' ? (
          /* Ojos apretados: dos X */
          <g
            stroke={colors.primaryForeground}
            strokeWidth="3"
            strokeLinecap="round"
            opacity={0.9}
          >
            {/* X izquierda */}
            <line x1={LEFT_EYE_CX - 5} y1={EYE_CY - 5} x2={LEFT_EYE_CX + 5} y2={EYE_CY + 5} />
            <line x1={LEFT_EYE_CX + 5} y1={EYE_CY - 5} x2={LEFT_EYE_CX - 5} y2={EYE_CY + 5} />
            {/* X derecha */}
            <line x1={RIGHT_EYE_CX - 5} y1={EYE_CY - 5} x2={RIGHT_EYE_CX + 5} y2={EYE_CY + 5} />
            <line x1={RIGHT_EYE_CX + 5} y1={EYE_CY - 5} x2={RIGHT_EYE_CX - 5} y2={EYE_CY + 5} />
          </g>
        ) : mood === 'happy' ? (
          /* Ojos felices: arcos hacia arriba (ojos cerrados sonrientes) */
          <g
            stroke={colors.primaryForeground}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          >
            <path d={`M ${LEFT_EYE_CX - 7} ${EYE_CY + 2} Q ${LEFT_EYE_CX} ${EYE_CY - 9} ${LEFT_EYE_CX + 7} ${EYE_CY + 2}`} />
            <path d={`M ${RIGHT_EYE_CX - 7} ${EYE_CY + 2} Q ${RIGHT_EYE_CX} ${EYE_CY - 9} ${RIGHT_EYE_CX + 7} ${EYE_CY + 2}`} />
          </g>
        ) : (
          /* Ojos normales (idle / thinking) */
          <g>
            {[LEFT_EYE_CX, RIGHT_EYE_CX].map((cx) => (
              <g key={cx}>
                {/* Esclerótica (blanco del ojo) */}
                <ellipse
                  cx={cx} cy={EYE_CY}
                  rx={EYE_RX} ry={blinking ? 1 : EYE_RY}
                  fill={colors.primaryForeground}
                  style={{
                    transition: 'ry 100ms ease-in-out',
                  }}
                />
                {/* Pupila */}
                {!blinking && (
                  <circle
                    cx={cx + pupilOffset.x}
                    cy={EYE_CY + pupilOffset.y}
                    r={PUPIL_R}
                    fill={colors.primary}
                    style={{
                      transition: 'cx 250ms ease-out, cy 250ms ease-out',
                    }}
                  >
                    {mood === 'thinking' && canAnimate && (
                      <animateTransform
                        attributeName="transform"
                        type="translate"
                        values={`0,0; ${LOOK_OFFSET},0; 0,-${LOOK_OFFSET}; -${LOOK_OFFSET},0; 0,0`}
                        dur="2s"
                        repeatCount="indefinite"
                        additive="sum"
                      />
                    )}
                  </circle>
                )}
                {/* Brillo del ojo */}
                {!blinking && (
                  <circle
                    cx={cx + GLINT_OFFSET_X + pupilOffset.x * 0.3}
                    cy={EYE_CY + GLINT_OFFSET_Y + pupilOffset.y * 0.3}
                    r={GLINT_R}
                    fill={colors.primaryForeground}
                    opacity={0.8}
                    style={{
                      transition: 'cx 250ms ease-out, cy 250ms ease-out',
                    }}
                  />
                )}
              </g>
            ))}
          </g>
        )}

        {/* ── Boca ──────────────────────────────────────────────────── */}
        {!isSmall && (
          mood === 'happy' ? (
            /* Sonrisa amplia con forma de D */
            <path
              d={`M 40 ${MOUTH_Y} Q 50 ${MOUTH_Y + 12} 60 ${MOUTH_Y}`}
              stroke={colors.primaryForeground}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          ) : mood === 'oops' ? (
            /* Boca de preocupación: línea recta ondulada */
            <path
              d={`M 40 ${MOUTH_Y + 3} Q 45 ${MOUTH_Y} 50 ${MOUTH_Y + 3} Q 55 ${MOUTH_Y + 6} 60 ${MOUTH_Y + 3}`}
              stroke={colors.primaryForeground}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity={0.8}
            />
          ) : mood === 'thinking' ? (
            /* Boquita pensativa: un circulito abierto */
            <ellipse
              cx={50} cy={MOUTH_Y + 2}
              rx={4} ry={5}
              stroke={colors.primaryForeground}
              strokeWidth="2"
              fill="none"
              opacity={0.7}
            />
          ) : (
            /* Sonrisa suave por defecto */
            <path
              d={`M 42 ${MOUTH_Y} Q 50 ${MOUTH_Y + 8} 58 ${MOUTH_Y}`}
              stroke={colors.primaryForeground}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity={0.85}
            />
          )
        )}

        {/* ── Accesorios reactivos ──────────────────────────────────── */}

        {/* Thinking: espiral/engranaje giratorio arriba a la derecha */}
        {mood === 'thinking' && canAnimate && !isSmall && (
          <g>
            <circle
              cx={78} cy={18} r={6}
              stroke={colors.primaryForeground}
              strokeWidth="1.5"
              fill="none"
              opacity={0.5}
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 78 18"
                to="360 78 18"
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Tres dientes del engranaje */}
            {[0, 120, 240].map((deg) => (
              <line
                key={deg}
                x1={78} y1={10}
                x2={78} y2={7}
                stroke={colors.primaryForeground}
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity={0.4}
                transform={`rotate(${deg} 78 18)`}
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`${deg} 78 18`}
                  to={`${deg + 360} 78 18`}
                  dur="3s"
                  repeatCount="indefinite"
                />
              </line>
            ))}
          </g>
        )}

        {/* Happy: sparkle ✦ arriba a la derecha, aparece con la reacción */}
        {mood === 'happy' && reacting && canAnimate && !isSmall && (
          <g opacity={0.9}>
            {/* Estrellita de cuatro puntas */}
            <path
              d="M 80 12 L 82 17 L 87 19 L 82 21 L 80 26 L 78 21 L 73 19 L 78 17 Z"
              fill={colors.primaryForeground}
            >
              <animateTransform
                attributeName="transform"
                type="scale"
                values="0;1.2;1"
                dur="0.4s"
                repeatCount="1"
                additive="replace"
                fill="freeze"
              />
              <animate
                attributeName="opacity"
                values="0;1;0.9"
                dur="0.5s"
                repeatCount="1"
                fill="freeze"
              />
            </path>
            {/* Segunda estrellita más pequeña */}
            <path
              d="M 18 16 L 19.5 19 L 22.5 20.5 L 19.5 22 L 18 25 L 16.5 22 L 13.5 20.5 L 16.5 19 Z"
              fill={colors.primaryForeground}
              opacity={0.6}
            >
              <animateTransform
                attributeName="transform"
                type="scale"
                values="0;1.1;0.9"
                dur="0.5s"
                begin="0.15s"
                repeatCount="1"
                additive="replace"
                fill="freeze"
              />
            </path>
          </g>
        )}

        {/* Oops: gota de sudor */}
        {mood === 'oops' && !isSmall && (
          <g>
            <path
              d="M 80 25 Q 82 30 80 35 Q 77 32 80 25"
              fill={colors.primaryForeground}
              opacity={0.5}
            >
              {canAnimate && (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0,0; 0,3; 0,0"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              )}
            </path>
          </g>
        )}

        {/* ── Mejillas (rubor sutil, solo en lg) ────────────────────── */}
        {size === 'lg' && mood !== 'oops' && (
          <g opacity={0.12}>
            <circle cx={22} cy={54} r={8} fill={colors.primaryForeground} />
            <circle cx={78} cy={54} r={8} fill={colors.primaryForeground} />
          </g>
        )}
      </svg>

      {/* ── CSS para la animación de flotación ─────────────────────── */}
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
