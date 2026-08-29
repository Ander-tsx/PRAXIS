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

export type PraxSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * ⚠️ **`lg` es 56, no 80** — el 80 de antes ahora es `xl`.
 *
 * De `md` (40) a 80 no había nada, y la cabecera del chat necesitaba justo eso:
 * una cara con presencia junto al nombre sin comerse el alto de la fila. Con el
 * salto al doble, o se quedaba pequeña o desmontaba la cabecera.
 */
const MEDIDAS: Record<PraxSize, { px: number; caja: string }> = {
  xs: { px: 20, caja: 'h-5 w-5' },
  sm: { px: 28, caja: 'h-7 w-7' },
  md: { px: 40, caja: 'h-10 w-10' },
  lg: { px: 56, caja: 'h-14 w-14' },
  xl: { px: 80, caja: 'h-20 w-20' },
};

/**
 * Si esta cara lleva boca.
 *
 * ⚠️ **Está a prueba.** La boca compite con los ojos, que es donde vive la
 * expresión entera; se puso para ver si a ese tamaño suma o solo mete ruido.
 * Ponerlo en `false` devuelve la cara al estado anterior sin tocar nada más:
 * `BOCAS` y el rasgo se quedan sin usar, y se borran de un tirón si la
 * respuesta es que no.
 */
const CON_BOCA = true;

/** Por debajo de este tamaño la boca son dos píxeles y estorba. */
const BOCA_DESDE: PraxSize[] = ['md', 'lg', 'xl'];

export interface PraxAvatarProps {
  mood?: PraxMood;
  size?: PraxSize;
  className?: string;
  /** Desactiva las animaciones de parpadeo y mirada. */
  animate?: boolean;
}

/* ─── Geometría del cuerpo ────────────────────────────────────────────────
 *
 * Un fantasmita, no un cubo: cúpula semicircular arriba y faldón escalonado
 * abajo. El faldón se dibuja con ángulos rectos —tres pies y dos muescas— para
 * que siga leyéndose como pixel-art y no como una nube redondeada.
 *
 * viewBox = 100×100. Cúpula de radio 38 centrada en (50, 44): la coronilla
 * queda en y=6 y los costados bajan rectos hasta el faldón.
 *
 * ⚠️ **Las esquinas del faldón llevan una curva de 2.5, por dentro y por
 * fuera.** El ángulo recto puro es lo que hacía que las patas se leyeran como
 * un recorte y no como parte del bicho. Se dibujan con `Q` y el vértice de
 * control en la esquina: para 90° la parábola es indistinguible de un arco de
 * círculo y sale una expresión mucho más corta que un `A` por esquina.
 * ──────────────────────────────────────────────────────────────────────── */

const CUERPO_D = [
  'M 12 44',
  'A 38 38 0 0 1 88 44', // cúpula
  'L 88 87.5 Q 88 90 85.5 90', // costado derecho → pie derecho
  'L 75.5 90 Q 73 90 73 87.5', // pie derecho → subida
  'L 73 84.5 Q 73 82 70.5 82', // subida → techo de la muesca
  'L 60.5 82 Q 58 82 58 84.5', // muesca → bajada
  'L 58 87.5 Q 58 90 55.5 90', // bajada → pie central
  'L 44.5 90 Q 42 90 42 87.5', // pie central → subida
  'L 42 84.5 Q 42 82 39.5 82', // subida → techo de la muesca
  'L 29.5 82 Q 27 82 27 84.5', // muesca → bajada
  'L 27 87.5 Q 27 90 24.5 90', // bajada → pie izquierdo
  'L 14.5 90 Q 12 90 12 87.5', // pie izquierdo → costado izquierdo
  'Z',
].join(' ');

/* ─── Geometría de la cara ───────────────────────────────────────────────
 *
 * ⚠️ **Cada ojo —y la boca— son siempre las mismas dos barras.** Antes
 * `idle`/`thinking` eran `<rect>` y `happy`/`oops` eran `<polyline>`: al cambiar
 * de mood el navegador destruía unos nodos y creaba otros, así que la cara
 * **saltaba de golpe**, sin transición posible — no hay nada que interpolar
 * entre dos elementos distintos.
 *
 * Ahora las cuatro expresiones son la misma pareja de barras colocadas de otra
 * manera: apiladas forman un cuadrado, aplanadas un ojo entrecerrado, giradas
 * en V un chevrón, giradas al revés una sonrisa. Como solo cambia el
 * `transform`, el navegador interpola la matriz y la cara **se dobla** de una
 * expresión a la siguiente.
 *
 * De ahí que las barras se posicionen con `transform` y no con `x`/`y`: la
 * geometría (`x`, `y`, `width`, `height`, `rx`) es fija; todo lo demás es
 * transporte.
 */

/** Barra del ojo. El `rx` es lo que quita el borde duro de las esquinas. */
const OJO_W = 12;
const OJO_H = 9;
const OJO_RX = 2.4;

/** Barra de la boca — más ancha y más plana que la del ojo. */
const BOCA_W = 14;
const BOCA_H = 5;
const BOCA_RX = 2;

/** Cuánto se aplasta el ojo al parpadear: 0.16 deja una línea de ~2 de alto. */
const BLINK_SCALE_Y = 0.16;

const LEFT_EYE_CX = 35;
const RIGHT_EYE_CX = 65;
const EYE_CY = 40;
const BOCA_CX = 50;
const BOCA_CY = 61;

/** Una barra colocada: desplazamiento, giro y escala respecto a su centro. */
interface Barra {
  dx: number;
  dy: number;
  rot: number;
  sx: number;
  sy: number;
}

/**
 * Los ojos de cada expresión.
 *
 * ⚠️ **`dy` no puede pasar de `OJO_H / 2 - OJO_RX`.** Con las esquinas
 * redondeadas, dos barras apiladas dejan de tocarse a lo ancho antes de tocarse
 * a lo alto: si se separan más de eso, el redondeo de una asoma por encima del
 * borde de la otra y el ojo sale con la cintura pellizcada. Por eso el ojo
 * `idle` mide 12×13 y no 12×18 — el límite lo pone el radio, no el gusto.
 *
 * `blink` tampoco está aquí: el parpadeo es un `scaleY` sobre el ojo entero,
 * para que pueda ir a su propia velocidad (90 ms) sin arrastrar la del cambio
 * de mood (320 ms). Mezclarlos daba un parpadeo perezoso o un morph brusco,
 * según cuál ganara.
 */
const OJOS: Record<PraxMood, [Barra, Barra]> = {
  /* Dos barras apiladas = un cuadrado sólido con las esquinas suaves. */
  idle: [
    { dx: 0, dy: -2, rot: 0, sx: 1, sy: 1 },
    { dx: 0, dy: 2, rot: 0, sx: 1, sy: 1 },
  ],
  /* Las mismas dos, aplastadas y solapadas = un rectángulo estrecho. */
  thinking: [
    { dx: 0, dy: -0.8, rot: 0, sx: 1, sy: 0.42 },
    { dx: 0, dy: 0.8, rot: 0, sx: 1, sy: 0.42 },
  ],
  /* Giradas en V con el vértice arriba = `^`. */
  happy: [
    { dx: -3.65, dy: -0.15, rot: -38, sx: 0.77, sy: 0.4 },
    { dx: 3.65, dy: -0.15, rot: 38, sx: 0.77, sy: 0.4 },
  ],
  /* Giradas con el vértice a un lado = `>` (y `<` en el ojo espejado). */
  oops: [
    { dx: 0, dy: -2.75, rot: 29, sx: 0.95, sy: 0.4 },
    { dx: 0, dy: 2.75, rot: -29, sx: 0.95, sy: 0.4 },
  ],
};

/**
 * La boca de cada expresión, con el mismo truco de dos barras.
 *
 * En `idle`, `thinking` y `oops` las dos barras se superponen exactamente —una
 * sola forma— y en `happy` se abren en `v`. Podría ser un solo `<rect>`, pero
 * entonces la sonrisa no tendría de dónde salir: hacen falta dos trazos para
 * doblar una línea.
 */
const BOCAS: Record<PraxMood, [Barra, Barra]> = {
  /* Sonrisa suave en reposo. */
  idle: [
    { dx: -2.8, dy: 0.3, rot: 14, sx: 0.75, sy: 0.7 },
    { dx: 2.8, dy: 0.3, rot: -14, sx: 0.75, sy: 0.7 },
  ],
  /* Puntito de concentración. */
  thinking: [
    { dx: 0, dy: 0, rot: 0, sx: 0.42, sy: 0.7 },
    { dx: 0, dy: 0, rot: 0, sx: 0.42, sy: 0.7 },
  ],
  /* Las dos barras abiertas en `v` = sonrisa. */
  happy: [
    { dx: -4.25, dy: 0.5, rot: 22, sx: 0.65, sy: 0.66 },
    { dx: 4.25, dy: 0.5, rot: -22, sx: 0.65, sy: 0.66 },
  ],
  /* Boca abierta, alta y estrecha. */
  oops: [
    { dx: 0, dy: 0, rot: 0, sx: 0.58, sy: 1.6 },
    { dx: 0, dy: 0, rot: 0, sx: 0.58, sy: 1.6 },
  ],
};

/** El ojo derecho es el izquierdo del revés: así `> <` sale simétrico solo. */
function espejar({ dx, dy, rot, sx, sy }: Barra): Barra {
  return { dx: -dx, dy, rot: -rot, sx, sy };
}

function transformarBarra({ dx, dy, rot, sx, sy }: Barra): string {
  return `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${sx}, ${sy})`;
}

/* ─── Tipos de mirada ─────────────────────────────────────────────────── */

type LookDir = 'center' | 'left' | 'right';

interface PraxRasgoProps {
  cx: number;
  cy: number;
  /** Las dos barras, ya elegidas por el mood. */
  barras: [Barra, Barra];
  w: number;
  h: number;
  rx: number;
  mirror?: boolean;
  /** Aplasta el rasgo entero. Solo lo usan los ojos. */
  blinking?: boolean;
  /** Desplazamiento lateral. Solo lo usan los ojos. */
  gaze?: number;
  opacity?: number;
}

/**
 * Un rasgo de la cara: un ojo o la boca.
 *
 * Tres capas anidadas, y cada una existe para poder llevar su propio tiempo:
 * la posición (atributo `transform`, estática), la mirada lateral (420 ms), el
 * parpadeo (90 ms) y, dentro, las barras del mood (320 ms). Si todo colgara del
 * mismo nodo, cada concepto tendría que compartir duración con los otros tres.
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
  gaze = 0,
  opacity = 1,
}: PraxRasgoProps) {
  const [a, b] = barras;
  const puestas = mirror ? [espejar(a), espejar(b)] : [a, b];

  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* Mirada lateral */}
      <g
        style={{
          /* Traslación pura: no depende de `transform-origin`. */
          transform: `translateX(${gaze}px)`,
          transition: 'transform 420ms ease-out',
        }}
      >
        {/* Parpadeo: aplasta el rasgo entero, sea cual sea su forma */}
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
                 tema y aquel se queda blanco en los dos. Ver su nota en
                 `commons/tokens/colors.ts`. */
              fill={colors.praxFace}
              opacity={opacity}
              style={{
                transform: transformarBarra(barra),
                /*
                 * ⚠️ `fill-box` + `center`, no `0 0`.
                 *
                 * En SVG anidado, `transform-origin: 0 0` se resuelve contra el
                 * `viewBox` de la raíz, no contra el origen local del elemento:
                 * con un `<g>` trasladado por medio, el giro sale desde otro
                 * punto y el rasgo se va de sitio al cambiar de mood. `fill-box`
                 * ancla el origen a la caja de la propia barra —que está
                 * centrada en su origen— y eso no depende de los ancestros.
                 */
                transformBox: 'fill-box',
                transformOrigin: 'center',
                transition: 'transform 320ms cubic-bezier(0.34, 1.15, 0.64, 1)',
              }}
            />
          ))}
        </g>
      </g>
    </g>
  );
}

/**
 * La cara de PRAX — fantasmita pixel-art.
 *
 * Un cuerpo de fantasma con el degradado de la marca y dos ojos geométricos que
 * se doblan de una expresión a otra según el mood:
 *
 * - **idle**: dos cuadrados sólidos
 * - **thinking**: entrecerrados (rectángulos estrechos), con un ligero vaivén
 * - **happy**: chevrones `^ ^` apuntando arriba
 * - **oops**: chevrones `> <` apretados
 *
 * La boca (`CON_BOCA`, a prueba) sigue el mismo mood con el mismo mecanismo, y
 * solo aparece de `md` para arriba: por debajo de eso son dos píxeles.
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
    const delay = 1500 + Math.random() * 2500;
    blinkTimeout.current = setTimeout(() => {
      setBlinking(true);
      setTimeout(() => {
        setBlinking(false);
        /* Doble parpadeo ocasional más frecuente. */
        if (Math.random() < 0.35) {
          setTimeout(() => {
            setBlinking(true);
            setTimeout(() => setBlinking(false), 90);
          }, 160);
        }
      }, 110);
      scheduleBlink();
    }, delay);
  }, [canAnimate]);

  useEffect(() => {
    scheduleBlink();
    return () => {
      if (blinkTimeout.current) clearTimeout(blinkTimeout.current);
    };
  }, [scheduleBlink]);

  /* ── Mirada ─────────────────────────────────────────────────────────── */
  const scheduleLook = useCallback(() => {
    if (!canAnimate) return;
    const delay = 1500 + Math.random() * 3000;
    lookTimeout.current = setTimeout(() => {
      const dirs: LookDir[] = ['left', 'right'];
      const picked = dirs[Math.floor(Math.random() * dirs.length)] ?? 'left';
      setLookDir(picked);
      setTimeout(() => setLookDir('center'), 700 + Math.random() * 1000);
      scheduleLook();
    }, delay);
  }, [canAnimate]);

  useEffect(() => {
    scheduleLook();
    return () => {
      if (lookTimeout.current) clearTimeout(lookTimeout.current);
    };
  }, [scheduleLook]);

  /* Mientras piensa, la mirada se queda quieta: ya se mueve el vaivén.
     Gaze más notorio (4.5 en vez de 3). */
  const gaze = mood === 'thinking' ? 0 : lookDir === 'left' ? -4.5 : lookDir === 'right' ? 4.5 : 0;

  /* Solo se parpadea con los ojos abiertos; aplastar un chevrón no dice nada. */
  const parpadeando = blinking && (mood === 'idle' || mood === 'thinking');

  return (
    <span
      role="img"
      aria-label={PRAX_LABELS[mood]}
      title={PRAX_LABELS[mood]}
      className={`inline-flex shrink-0 select-none items-center justify-center ${medidas.caja} ${className}`}
      style={{
        animation:
          canAnimate && (mood === 'idle' || mood === 'happy')
            ? 'prax-float 3s ease-in-out infinite'
            : undefined,
      }}
    >
      {/* aria-hidden: la etiqueta la lleva el <span> de fuera; repetirla aquí la anuncia dos veces. */}
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
          <linearGradient id="prax-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors.primary} />
            <stop offset="100%" stopColor={colors.primaryHover} />
          </linearGradient>
        </defs>

        {/* ── Cuerpo ────────────────────────────────────────────────── */}
        <path
          d={CUERPO_D}
          fill="url(#prax-grad)"
          stroke={alpha(colors.primary, 30)}
          strokeWidth="1.5"
          strokeLinejoin="miter"
        />

        {/* ── Ojos ──────────────────────────────────────────────────── */}
        <g
          style={{
            animation:
              canAnimate && mood === 'thinking'
                ? 'prax-eye-wobble 2s ease-in-out infinite'
                : undefined,
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
            gaze={gaze}
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
            gaze={gaze}
          />
        </g>

        {/* ── Boca ──────────────────────────────────────────────────── */}
        {CON_BOCA && BOCA_DESDE.includes(size) && (
          <PraxRasgo
            cx={BOCA_CX}
            cy={BOCA_CY}
            barras={BOCAS[mood]}
            w={BOCA_W}
            h={BOCA_H}
            rx={BOCA_RX}
            opacity={0.92}
          />
        )}

        {/* ── Accesorios reactivos (solo md/lg) ─────────────────────── */}

        {/* Thinking: tres puntos parpadeantes bajo los ojos */}
        {mood === 'thinking' && canAnimate && size !== 'sm' && (
          <g fill={colors.praxFace} opacity={0.4}>
            {[0, 1, 2].map((i) => (
              <rect key={i} x={38 + i * 10} y={71} width={4} height={4} rx={1.2}>
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

        {/* Oops: gota pixelada en la frente — a la altura de la sien se salía del cuerpo */}
        {mood === 'oops' && size !== 'xs' && size !== 'sm' && (
          <g fill={colors.praxFace} opacity={0.5}>
            {/*
              Un solo trazo, no cuatro rects apilados.

              Apilada en píxeles y con las esquinas redondeadas como el resto de
              la cara, la gota se deshacía en cuatro bolitas sueltas: el redondeo
              separa lo que en ángulo recto se leía como una silueta continua.
            */}
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
      </svg>
    </span>
  );
}
