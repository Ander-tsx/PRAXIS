'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
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

export type PraxSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * ⚠️ **`lg` es 56, no 80** — el 80 de antes ahora es `xl`.
 *
 * De `md` (40) a 80 no había nada, y la cabecera del chat necesitaba justo eso:
 * una cara con presencia junto al nombre sin comerse el alto de la fila.
 */
const MEDIDAS: Record<PraxSize, { px: number; caja: string }> = {
  xs: { px: 20, caja: 'h-5 w-5' },
  sm: { px: 28, caja: 'h-7 w-7' },
  md: { px: 40, caja: 'h-10 w-10' },
  lg: { px: 56, caja: 'h-14 w-14' },
  xl: { px: 80, caja: 'h-20 w-20' },
};

/** Por debajo de este tamaño la boca son dos píxeles y estorba. */
const BOCA_DESDE: PraxSize[] = ['md', 'lg', 'xl'];
/** Desde aquí hay sitio para el halo, la sombra del suelo y seguir al puntero. */
const ESCENA_DESDE: PraxSize[] = ['md', 'lg', 'xl'];

export interface PraxAvatarProps {
  mood?: PraxMood;
  size?: PraxSize;
  className?: string;
  /** Desactiva las animaciones: parpadeo, mirada, respiración y gestos. */
  animate?: boolean;
}

/* ─── Geometría del cuerpo ────────────────────────────────────────────────
 *
 * Un fantasmita, no un cubo: cúpula semicircular arriba y faldón escalonado
 * abajo, con tres pies y dos muescas en ángulo recto para que siga leyéndose
 * como pixel-art. viewBox = 100×100; cúpula de radio 38 centrada en (50, 44).
 *
 * ⚠️ **Las esquinas del faldón llevan una curva de 2.5**, con `Q` y el vértice
 * de control en la esquina: el ángulo recto puro hacía que las patas se leyeran
 * como un recorte y no como parte del bicho.
 *
 * ## El faldón ondula
 *
 * El cuerpo es una función de dónde apoya cada pie. Las variantes tienen
 * **exactamente los mismos comandos** —solo cambian números—, que es lo que
 * permite a `<animate attributeName="d">` interpolar entre ellas: los pies suben
 * y bajan en ola, como un fantasma que flota de verdad, sin partir la silueta.
 * ──────────────────────────────────────────────────────────────────────── */

function cuerpo(izq: number, centro: number, der: number): string {
  return [
    'M 12 44',
    'A 38 38 0 0 1 88 44',
    `L 88 ${der - 2.5} Q 88 ${der} 85.5 ${der}`,
    `L 75.5 ${der} Q 73 ${der} 73 ${der - 2.5}`,
    'L 73 84.5 Q 73 82 70.5 82',
    'L 60.5 82 Q 58 82 58 84.5',
    `L 58 ${centro - 2.5} Q 58 ${centro} 55.5 ${centro}`,
    `L 44.5 ${centro} Q 42 ${centro} 42 ${centro - 2.5}`,
    'L 42 84.5 Q 42 82 39.5 82',
    'L 29.5 82 Q 27 82 27 84.5',
    `L 27 ${izq - 2.5} Q 27 ${izq} 24.5 ${izq}`,
    `L 14.5 ${izq} Q 12 ${izq} 12 ${izq - 2.5}`,
    'Z',
  ].join(' ');
}

const CUERPO_D = cuerpo(90, 90, 90);
/** La ola: reposo → izquierda y derecha abajo → centro abajo → reposo. */
const OLA = [
  CUERPO_D,
  cuerpo(91.2, 88.6, 90.4),
  cuerpo(89.4, 91.4, 89.2),
  cuerpo(90.6, 89.2, 91.2),
  CUERPO_D,
].join(';');

/* ─── Geometría de la cara ───────────────────────────────────────────────
 *
 * ⚠️ **Cada ojo —y la boca— son siempre las mismas dos barras.** Las cuatro
 * expresiones son la misma pareja colocada de otra manera: apiladas forman un
 * cuadrado, aplanadas un ojo entrecerrado, giradas en V un chevrón. Como solo
 * cambia el `transform`, el navegador interpola y la cara **se dobla** de una
 * expresión a otra en vez de saltar.
 */

const OJO_W = 12;
const OJO_H = 9;
const OJO_RX = 2.4;
const BOCA_W = 14;
const BOCA_H = 5;
const BOCA_RX = 2;
/** Cuánto se aplasta el ojo al parpadear: 0.12 deja una línea fina. */
const BLINK_SCALE_Y = 0.12;

const LEFT_EYE_CX = 35;
const RIGHT_EYE_CX = 65;
const EYE_CY = 40;
const BOCA_CX = 50;
const BOCA_CY = 61;

interface Barra {
  dx: number;
  dy: number;
  rot: number;
  sx: number;
  sy: number;
}

/**
 * ⚠️ **`dy` no puede pasar de `OJO_H / 2 - OJO_RX`**: con las esquinas
 * redondeadas, dos barras apiladas más separadas dejan el ojo con la cintura
 * pellizcada.
 */
const OJOS: Record<PraxMood, [Barra, Barra]> = {
  idle: [
    { dx: 0, dy: -2, rot: 0, sx: 1, sy: 1 },
    { dx: 0, dy: 2, rot: 0, sx: 1, sy: 1 },
  ],
  thinking: [
    { dx: 0, dy: -0.8, rot: 0, sx: 1, sy: 0.42 },
    { dx: 0, dy: 0.8, rot: 0, sx: 1, sy: 0.42 },
  ],
  happy: [
    { dx: -3.65, dy: -0.15, rot: -38, sx: 0.77, sy: 0.4 },
    { dx: 3.65, dy: -0.15, rot: 38, sx: 0.77, sy: 0.4 },
  ],
  oops: [
    { dx: 0, dy: -2.75, rot: 29, sx: 0.95, sy: 0.4 },
    { dx: 0, dy: 2.75, rot: -29, sx: 0.95, sy: 0.4 },
  ],
};

const BOCAS: Record<PraxMood, [Barra, Barra]> = {
  idle: [
    { dx: -2.8, dy: 0.3, rot: 14, sx: 0.75, sy: 0.7 },
    { dx: 2.8, dy: 0.3, rot: -14, sx: 0.75, sy: 0.7 },
  ],
  thinking: [
    { dx: 0, dy: 0, rot: 0, sx: 0.42, sy: 0.7 },
    { dx: 0, dy: 0, rot: 0, sx: 0.42, sy: 0.7 },
  ],
  happy: [
    { dx: -4.25, dy: 0.5, rot: 22, sx: 0.65, sy: 0.66 },
    { dx: 4.25, dy: 0.5, rot: -22, sx: 0.65, sy: 0.66 },
  ],
  oops: [
    { dx: 0, dy: 0, rot: 0, sx: 0.58, sy: 1.6 },
    { dx: 0, dy: 0, rot: 0, sx: 0.58, sy: 1.6 },
  ],
};

function espejar({ dx, dy, rot, sx, sy }: Barra): Barra {
  return { dx: -dx, dy, rot: -rot, sx, sy };
}

function transformarBarra({ dx, dy, rot, sx, sy }: Barra): string {
  return `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${sx}, ${sy})`;
}

interface Mirada {
  x: number;
  y: number;
}

/**
 * Un rasgo de la cara: un ojo o la boca.
 *
 * Tres capas anidadas, cada una con su propio tiempo: la mirada (con muelle),
 * el parpadeo (90 ms) y, dentro, las barras del mood (340 ms con rebote). Si todo
 * colgara del mismo nodo, cada concepto tendría que compartir duración.
 */
function PraxRasgo({
  cx,
  cy,
  barras,
  w,
  h,
  rx,
  mirror = false,
  blinking = false,
  mirada = { x: 0, y: 0 },
  opacity = 1,
}: {
  cx: number;
  cy: number;
  barras: [Barra, Barra];
  w: number;
  h: number;
  rx: number;
  mirror?: boolean;
  blinking?: boolean;
  mirada?: Mirada;
  opacity?: number;
}) {
  const [a, b] = barras;
  const puestas = mirror ? [espejar(a), espejar(b)] : [a, b];

  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g
        style={{
          transform: `translate(${mirada.x}px, ${mirada.y}px)`,
          /* Un muelle corto: la mirada llega un pelín pasada y se asienta. */
          transition: 'transform 380ms cubic-bezier(0.34, 1.4, 0.64, 1)',
        }}
      >
        <g
          style={{
            transform: `scaleY(${blinking ? BLINK_SCALE_Y : 1})`,
            transformBox: 'fill-box',
            transformOrigin: 'center',
            transition: 'transform 90ms ease-in-out',
          }}
        >
          {puestas.map((barra, i) => (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: siempre son dos barras fijas
              key={i}
              x={-w / 2}
              y={-h / 2}
              width={w}
              height={h}
              rx={rx}
              /* ⚠️ `praxFace`, no `primaryForeground`: los rasgos giran con el
                 tema y aquel se queda blanco en los dos. */
              fill={colors.praxFace}
              opacity={opacity}
              style={{
                transform: transformarBarra(barra),
                /* ⚠️ `fill-box` + `center`, no `0 0`: en SVG anidado el origen
                   `0 0` se resuelve contra el viewBox raíz y el rasgo se va de
                   sitio al cambiar de mood. */
                transformBox: 'fill-box',
                transformOrigin: 'center',
                transition: 'transform 340ms cubic-bezier(0.34, 1.3, 0.64, 1)',
              }}
            />
          ))}
        </g>
      </g>
    </g>
  );
}

/** `prefers-reduced-motion`, en vivo. */
function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!consulta) return;
    setReducido(consulta.matches);
    const cambiar = () => setReducido(consulta.matches);
    consulta.addEventListener?.('change', cambiar);
    return () => consulta.removeEventListener?.('change', cambiar);
  }, []);
  return reducido;
}

/**
 * La cara de PRAX — el fantasmita, con volumen y vida.
 *
 * ## Lo que conserva
 *
 * La silueta (cúpula y faldón pixelado), el degradado de marca, los ojos de dos
 * barras que se doblan de una expresión a otra y los cuatro ánimos. Es el mismo
 * personaje: quien lo conocía lo reconoce al instante.
 *
 * ## Lo que gana
 *
 * - **Volumen**: luz desde arriba a la izquierda, sombra interior en el faldón,
 *   un filo de luz en el contorno y un brillo especular. Deja de ser una pegatina.
 * - **Cuerpo**: respira —sube estirándose y baja aplastándose— y el faldón
 *   ondula pie a pie. Debajo, una sombra que se encoge cuando sube.
 * - **Atención**: de `md` para arriba, los ojos **siguen al puntero** con un
 *   muelle; si nadie lo mueve, vuelve a mirar a los lados por su cuenta.
 * - **Gestos por ánimo**, de una sola vez al cambiar: un saltito con chispas al
 *   responder, un temblor al fallar. Pensando, el halo late, una banda de luz
 *   cruza el cuerpo y tres chispas orbitan alrededor.
 *
 * Todo es `transform`/`opacity` —CSS, SMIL o Web Animations—, nada fuerza un
 * reflow. Con `prefers-reduced-motion` o `animate={false}` se queda quieto, con
 * la cara del ánimo puesta.
 */
export function PraxAvatar({
  mood = 'idle',
  size = 'md',
  className = '',
  animate = true,
}: PraxAvatarProps) {
  const medidas = MEDIDAS[size];
  const reducido = useMovimientoReducido();
  const canAnimate = animate && size !== 'xs' && !reducido;
  const escena = ESCENA_DESDE.includes(size);
  const base = useId().replace(/:/g, '');
  const id = (nombre: string) => `prax-${nombre}-${base}`;

  const raiz = useRef<HTMLSpanElement>(null);
  const gesto = useRef<SVGGElement>(null);

  /* ── Parpadeo ───────────────────────────────────────────────────────── */
  const [blinking, setBlinking] = useState(false);
  const blinkTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const scheduleBlink = useCallback(() => {
    if (!canAnimate) return;
    const delay = 1800 + Math.random() * 2800;
    blinkTimeout.current = setTimeout(() => {
      setBlinking(true);
      setTimeout(() => {
        setBlinking(false);
        if (Math.random() < 0.3) {
          setTimeout(() => {
            setBlinking(true);
            setTimeout(() => setBlinking(false), 90);
          }, 150);
        }
      }, 105);
      scheduleBlink();
    }, delay);
  }, [canAnimate]);
  useEffect(() => {
    scheduleBlink();
    return () => {
      if (blinkTimeout.current) clearTimeout(blinkTimeout.current);
    };
  }, [scheduleBlink]);

  /* ── Mirada propia: a los lados, de vez en cuando ─────────────────────── */
  const [vistazo, setVistazo] = useState<Mirada>({ x: 0, y: 0 });
  const lookTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const scheduleLook = useCallback(() => {
    if (!canAnimate) return;
    const delay = 1600 + Math.random() * 3200;
    lookTimeout.current = setTimeout(() => {
      const lado = Math.random() < 0.5 ? -1 : 1;
      setVistazo({ x: lado * 4.2, y: Math.random() < 0.3 ? -1.2 : 0.4 });
      setTimeout(() => setVistazo({ x: 0, y: 0 }), 700 + Math.random() * 1000);
      scheduleLook();
    }, delay);
  }, [canAnimate]);
  useEffect(() => {
    scheduleLook();
    return () => {
      if (lookTimeout.current) clearTimeout(lookTimeout.current);
    };
  }, [scheduleLook]);

  /* ── Mirada que sigue al puntero (md en adelante) ─────────────────────── */
  const [puntero, setPuntero] = useState<Mirada | null>(null);
  useEffect(() => {
    if (!canAnimate || !escena) return;
    let marco = 0;
    let quieto: ReturnType<typeof setTimeout> | null = null;
    const mover = (e: PointerEvent) => {
      if (marco) return;
      marco = requestAnimationFrame(() => {
        marco = 0;
        const caja = raiz.current?.getBoundingClientRect();
        if (!caja) return;
        const dx = e.clientX - (caja.left + caja.width / 2);
        const dy = e.clientY - (caja.top + caja.height / 2);
        const distancia = Math.hypot(dx, dy);
        /* Lejos, no es a él a quien se mira: sigue a lo suyo. */
        if (distancia > 700) {
          setPuntero(null);
          return;
        }
        const k = Math.min(1, distancia / 160);
        const angulo = Math.atan2(dy, dx);
        setPuntero({ x: Math.cos(angulo) * 4.6 * k, y: Math.sin(angulo) * 2.8 * k });
        if (quieto) clearTimeout(quieto);
        quieto = setTimeout(() => setPuntero(null), 2600);
      });
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => {
      window.removeEventListener('pointermove', mover);
      if (marco) cancelAnimationFrame(marco);
      if (quieto) clearTimeout(quieto);
    };
  }, [canAnimate, escena]);

  /* ── Gestos de una vez, al cambiar de ánimo ───────────────────────────── */
  const [chispas, setChispas] = useState(0);
  const moodPrevio = useRef(mood);
  useEffect(() => {
    const previo = moodPrevio.current;
    moodPrevio.current = mood;
    if (!canAnimate || previo === mood) return;
    const nodo = gesto.current;
    if (mood === 'happy') {
      /* Un saltito: se agacha, sube estirado y aterriza aplastándose. */
      nodo?.animate(
        [
          { transform: 'translateY(0) scale(1, 1)' },
          { transform: 'translateY(1.5px) scale(1.08, 0.9)', offset: 0.18 },
          { transform: 'translateY(-10px) scale(0.93, 1.08)', offset: 0.45 },
          { transform: 'translateY(0) scale(1.06, 0.94)', offset: 0.72 },
          { transform: 'translateY(0) scale(1, 1)' },
        ],
        { duration: 720, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
      );
      setChispas((n) => n + 1);
    } else if (mood === 'oops') {
      nodo?.animate(
        [
          { transform: 'translateX(0) rotate(0deg)' },
          { transform: 'translateX(-3px) rotate(-3deg)', offset: 0.2 },
          { transform: 'translateX(3px) rotate(3deg)', offset: 0.4 },
          { transform: 'translateX(-2px) rotate(-1.5deg)', offset: 0.6 },
          { transform: 'translateX(1px) rotate(0.5deg)', offset: 0.8 },
          { transform: 'translateX(0) rotate(0deg)' },
        ],
        { duration: 520, easing: 'ease-out' },
      );
    } else if (mood === 'thinking') {
      /* Un respingo: se estira un instante, como quien se pone a ello. */
      nodo?.animate(
        [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(0.96, 1.05)', offset: 0.4 },
          { transform: 'scale(1, 1)' },
        ],
        { duration: 380, easing: 'ease-out' },
      );
    }
  }, [mood, canAnimate]);

  /* Pensando, mira arriba a un lado, como quien piensa; si no, puntero o vistazo. */
  const mirada: Mirada = mood === 'thinking' ? { x: 2.6, y: -2.2 } : (puntero ?? vistazo);
  const bocaMirada: Mirada = { x: mirada.x * 0.45, y: mirada.y * 0.35 };
  const parpadeando = blinking && (mood === 'idle' || mood === 'thinking');
  const pensando = mood === 'thinking';

  return (
    <span
      ref={raiz}
      role="img"
      aria-label={PRAX_LABELS[mood]}
      title={PRAX_LABELS[mood]}
      className={`inline-flex shrink-0 select-none items-center justify-center ${medidas.caja} ${className}`}
    >
      {/* aria-hidden: la etiqueta la lleva el <span> de fuera. */}
      <svg
        viewBox="0 0 100 100"
        width={medidas.px}
        height={medidas.px}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={id('cuerpo')} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" style={{ stopColor: colors.primary }} />
            <stop offset="100%" style={{ stopColor: colors.primaryHover }} />
          </linearGradient>
          {/* La luz, arriba a la izquierda: lo que le da volumen. */}
          <radialGradient id={id('luz')} cx="0.32" cy="0.2" r="0.75">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          {/* La sombra propia, abajo: el faldón pesa. */}
          <linearGradient id={id('peso')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="50%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
          </linearGradient>
          {/* El filo de luz del contorno, que se apaga hacia abajo. */}
          <linearGradient id={id('filo')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
            <stop offset="55%" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={id('halo')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" style={{ stopColor: colors.primary, stopOpacity: 0.55 }} />
            <stop offset="100%" style={{ stopColor: colors.primary, stopOpacity: 0 }} />
          </radialGradient>
          <linearGradient id={id('reflejo')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={id('silueta')}>
            <path d={CUERPO_D} />
          </clipPath>
        </defs>

        {/* ── Suelo y halo, detrás de todo ─────────────────────────────── */}
        {escena && (
          <>
            <circle
              cx="50"
              cy="50"
              r="50"
              fill={`url(#${id('halo')})`}
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'center',
                animation: canAnimate
                  ? `prax-halo ${pensando ? '1.3s' : '3.4s'} ease-in-out infinite`
                  : undefined,
                opacity: canAnimate ? undefined : 0.45,
              }}
            />
            <ellipse
              cx="50"
              cy="99"
              rx="25"
              ry="3.6"
              fill="#000"
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'center',
                animation: canAnimate ? 'prax-sombra 3.4s ease-in-out infinite' : undefined,
                opacity: canAnimate ? undefined : 0.5,
              }}
            />
          </>
        )}

        {/* ── El cuerpo que respira ────────────────────────────────────── */}
        <g
          style={{
            transformBox: 'fill-box',
            transformOrigin: '50% 100%',
            animation: canAnimate ? 'prax-respirar 3.4s ease-in-out infinite' : undefined,
          }}
        >
          <g ref={gesto} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
            {[
              { capa: 'cuerpo', fill: `url(#${id('cuerpo')})` },
              { capa: 'luz', fill: `url(#${id('luz')})` },
              { capa: 'peso', fill: `url(#${id('peso')})` },
            ].map(({ capa, fill }) => (
              <path key={capa} d={CUERPO_D} fill={fill}>
                {canAnimate && (
                  <animate
                    attributeName="d"
                    dur="2.6s"
                    repeatCount="indefinite"
                    values={OLA}
                    calcMode="spline"
                    keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
                  />
                )}
              </path>
            ))}
            {size !== 'xs' && (
              <path
                d={CUERPO_D}
                stroke={`url(#${id('filo')})`}
                strokeWidth="1.4"
                strokeLinejoin="round"
                fill="none"
              >
                {canAnimate && (
                  <animate
                    attributeName="d"
                    dur="2.6s"
                    repeatCount="indefinite"
                    values={OLA}
                    calcMode="spline"
                    keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
                  />
                )}
              </path>
            )}

            {/* Pensando: una banda de luz cruza el cuerpo, recortada a él. */}
            {pensando && canAnimate && (
              <g clipPath={`url(#${id('silueta')})`}>
                <rect
                  x="0"
                  y="-10"
                  width="34"
                  height="120"
                  fill={`url(#${id('reflejo')})`}
                  style={{ animation: 'prax-reflejo 1.9s ease-in-out infinite' }}
                />
              </g>
            )}

            {/* El brillo especular: lo que hace que parezca de un material. */}
            {size !== 'xs' && (
              <ellipse
                cx="31"
                cy="20"
                rx="7.5"
                ry="3.6"
                fill="#fff"
                opacity="0.32"
                transform="rotate(-32 31 20)"
              />
            )}

            {/* ── Ojos ─────────────────────────────────────────────────── */}
            <g
              style={{
                animation:
                  canAnimate && pensando ? 'prax-eye-wobble 2s ease-in-out infinite' : undefined,
              }}
            >
              <PraxRasgo
                cx={LEFT_EYE_CX}
                cy={EYE_CY}
                barras={OJOS[mood]}
                w={OJO_W}
                h={OJO_H}
                rx={OJO_RX}
                blinking={parpadeando}
                mirada={mirada}
              />
              <PraxRasgo
                cx={RIGHT_EYE_CX}
                cy={EYE_CY}
                barras={OJOS[mood]}
                w={OJO_W}
                h={OJO_H}
                rx={OJO_RX}
                mirror
                blinking={parpadeando}
                mirada={mirada}
              />
            </g>

            {BOCA_DESDE.includes(size) && (
              <PraxRasgo
                cx={BOCA_CX}
                cy={BOCA_CY}
                barras={BOCAS[mood]}
                w={BOCA_W}
                h={BOCA_H}
                rx={BOCA_RX}
                mirada={bocaMirada}
                opacity={0.92}
              />
            )}

            {/* Oops: una gota en la frente. */}
            {mood === 'oops' && escena && (
              <g fill={colors.praxFace} opacity={0.5}>
                <path d="M 71 14 L 75 24 Q 75 31 71 31 Q 67 31 67 24 Z" />
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
          </g>
        </g>

        {/* ── Pensando: tres chispas en órbita, en un plano inclinado ──── */}
        {pensando && canAnimate && (
          <g transform="translate(50 54) scale(1 0.34)">
            {/* SMIL y no CSS: gira sobre su propio (0,0), que en un SVG anidado
                es justo lo que `transform-origin` no garantiza. */}
            <g>
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0"
                to="360"
                dur="2.2s"
                repeatCount="indefinite"
              />
              {[
                { a: 0, r: 3.4, o: 0.95 },
                { a: 120, r: 2.4, o: 0.7 },
                { a: 240, r: 1.8, o: 0.5 },
              ].map(({ a, r, o }) => (
                <circle
                  key={a}
                  cx={Math.cos((a * Math.PI) / 180) * 56}
                  cy={Math.sin((a * Math.PI) / 180) * 56}
                  r={r * 2.4}
                  fill={colors.primary}
                  opacity={o}
                  style={{ filter: `drop-shadow(0 0 4px ${alpha(colors.primary, 80)})` }}
                />
              ))}
            </g>
          </g>
        )}

        {/* ── Chispas al responder, de una vez ─────────────────────────── */}
        {chispas > 0 && canAnimate && (
          <g key={chispas} fill={colors.primary}>
            {[
              { x: 88, y: 14, s: 1, d: 60 },
              { x: 10, y: 24, s: 0.75, d: 160 },
              { x: 94, y: 52, s: 0.6, d: 260 },
            ].map(({ x, y, s, d }) => (
              <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
                <path
                  d="M 0 -7 Q 1 -1 7 0 Q 1 1 0 7 Q -1 1 -7 0 Q -1 -1 0 -7 Z"
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    animation: `prax-chispa 700ms ${d}ms cubic-bezier(0.22, 1, 0.36, 1) both`,
                  }}
                />
              </g>
            ))}
          </g>
        )}
      </svg>
    </span>
  );
}
