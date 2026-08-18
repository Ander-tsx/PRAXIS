'use client';

import { useEffect, useState } from 'react';
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

/**
 * Los fotogramas de cada estado.
 *
 * ## ⚠️ Es ASCII de verdad, y eso fue una decisión
 *
 * Todo lo que hay aquí sale del teclado: `^ - o v _ < > u`. La versión anterior
 * usaba `ω` (U+03C9) y `•` (U+2022) buscando un kaomoji más «mono», y aunque son
 * caracteres comunes seguía siendo tipografía prestada: en una fuente monoespacio
 * el `ω` es ancho, se descuelga por abajo y arrastra la cara fuera del centro.
 * Con ASCII puro la cara **cae siempre donde tiene que caer**, en cualquier
 * fuente y en cualquier tamaño.
 *
 * ## Y por qué cada estado tiene varios
 *
 * Porque una cara fija no está viva. El primero de cada lista es el de reposo del
 * estado —el que se ve el 90 % del tiempo— y los demás son gestos breves: un
 * parpadeo, una mirada de lado, los ojos muy abiertos. Se alternan con pausas
 * desiguales para que no se lea como un bucle. Ver `PraxAvatar`.
 *
 * ⚠️ **El de reposo de cada estado va el primero**, y el orden importa: es el que
 * se pinta en el servidor y el que se ve sin JavaScript. Si el primero fuera un
 * parpadeo, la cara aparecería con los ojos cerrados en cada carga.
 */
export const PRAX_FACES: Record<PraxMood, readonly string[]> = {
  /* En reposo mira de frente, parpadea, y de vez en cuando se distrae mirando a
     un lado. Lo de mirar a los lados es lo que más «piensa por su cuenta» dice. */
  idle: ['^-^', '^-^', '-_-', 'o-o', '^-<', '>-^'],
  /* Pensando: los ojos se van arriba y a los lados, que es lo que hace cualquiera
     al buscar algo en la cabeza. Ninguno es una cara de esfuerzo: no está
     sufriendo, está mirando sus datos. */
  thinking: ['o_o', 'o_o', '^_o', 'o_^', '-_o', 'o_-'],
  /* Contento: ojos cerrados hacia arriba, que es como se sonríe de verdad, y un
     par de fotogramas con la boca abierta para el momento de responder. */
  happy: ['^o^', '^o^', '^u^', '^-^', '^O^'],
  /* Apretados y torcidos. Ni asustado ni enfadado: incómodo, que es lo que toca
     cuando el que ha fallado eres tú. */
  oops: ['>_<', '>_<', 'x_x', '>_o', 'T_T'],
};

/** El fotograma de reposo: el que se sirve desde el servidor. Ver arriba. */
function caraEnReposo(mood: PraxMood): string {
  return PRAX_FACES[mood][0];
}

/** Qué se dice de cada estado, para quien no ve la cara. */
const PRAX_LABELS: Record<PraxMood, string> = {
  idle: `${PRAX_NAME}, listo`,
  thinking: `${PRAX_NAME} está pensando`,
  happy: `${PRAX_NAME} ha respondido`,
  oops: `${PRAX_NAME} no ha podido`,
};

/**
 * Cada cuánto cambia de gesto, en milisegundos.
 *
 * `[minimo, maximo]` y se sortea dentro: un intervalo fijo se lee como un reloj y
 * deja de parecer vivo a los diez segundos. Pensando va más rápido —está
 * haciendo algo— y en reposo va lento, porque una cara que se mueve cada segundo
 * en una esquina de la pantalla es una distracción, no compañía.
 */
const RITMO: Record<PraxMood, [number, number]> = {
  idle: [2600, 5200],
  thinking: [420, 900],
  happy: [900, 1800],
  oops: [1400, 2600],
};

/** Cuánto dura el gesto antes de volver al reposo del estado. */
const DURACION_DEL_GESTO = 260;

export type PraxSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Caja y tamaño de letra.
 *
 * Van juntos y no se derivan uno del otro porque **no escalan igual**: la cara
 * son tres caracteres, así que en la caja pequeña el texto tiene que encoger más
 * que proporcionalmente o toca los bordes.
 *
 * - `xs` — el icono de la barra lateral, junto a las demás entradas.
 * - `sm` — dentro de una burbuja de conversación, al lado del texto.
 * - `md` — una cabecera o una fila de menú.
 * - `lg` — la portada de su pantalla, donde la cara **es** el contenido.
 */
const MEDIDAS: Record<PraxSize, { caja: string; cara: string; radio: string }> = {
  xs: { caja: 'h-5 w-5', cara: 'text-[7px]', radio: 'rounded-[30%]' },
  sm: { caja: 'h-7 w-7', cara: 'text-[9px]', radio: 'rounded-[30%]' },
  md: { caja: 'h-10 w-10', cara: 'text-[12px]', radio: 'rounded-[30%]' },
  lg: { caja: 'h-20 w-20', cara: 'text-[24px]', radio: 'rounded-[28%]' },
};

export interface PraxAvatarProps {
  mood?: PraxMood;
  size?: PraxSize;
  /**
   * Quieto, sin gestos.
   *
   * Para donde la cara es un **icono** y no un personaje: la entrada de la barra
   * lateral, por ejemplo, donde algo que parpadea al lado de «Mensajes» y
   * «Proyectos» pide atención que no le corresponde.
   */
  quieto?: boolean;
  className?: string;
}

/**
 * La cara de PRAX.
 *
 * ## Por qué no es una imagen
 *
 * Se valoró una mascota ilustrada. Esto es un cuadrado redondeado con un
 * degradado de la marca y tres caracteres dentro, y gana en las cuatro cosas que
 * importan aquí:
 *
 * 1. **Sigue al tema.** El degradado sale de `--color-primary`, que cambia con
 *    `data-theme`. Un PNG habría necesitado dos archivos y acordarse de los dos.
 * 2. **No pesa nada** ni añade una petición a la carga inicial.
 * 3. **Escala** de 20 px en la barra lateral a 80 px en su portada sin borrarse.
 * 4. **Se mueve**, que es lo que la convierte en información y no en adorno:
 *    mientras el modelo tarda, esta cara es lo único que dice que sigue vivo.
 *
 * ## ⚠️ La animación es de cliente, y el primer fotograma es de servidor
 *
 * El componente lleva `'use client'` porque los gestos necesitan temporizadores.
 * Pero **arranca siempre en el fotograma de reposo**, que es el que se sirve
 * desde el servidor: así el HTML y el primer render del cliente pintan lo mismo y
 * no hay desajuste de hidratación — que con un fotograma sorteado al azar
 * saltaría en cada carga.
 *
 * Y con `prefers-reduced-motion` no se mueve en absoluto. Una cara que gesticula
 * es exactamente el tipo de movimiento decorativo que esa preferencia pide
 * quitar, y aquí quitarlo no cuesta información: el estado se sigue leyendo en la
 * cara de reposo y en el `aria-label`.
 *
 * ⚠️ El degradado va en `background` inline y no en una clase de Tailwind porque
 * se construye con `alpha()` sobre los tokens; una utilidad literal no puede
 * interpolar eso, y un token que solo se consume así **se recorta del CSS final
 * en silencio** si no está en `@theme static` — la trampa que documenta
 * `theme.css`.
 */
export function PraxAvatar({
  mood = 'idle',
  size = 'md',
  quieto = false,
  className = '',
}: PraxAvatarProps) {
  const medidas = MEDIDAS[size];
  const [cara, setCara] = useState(() => caraEnReposo(mood));

  /* Al cambiar de estado se vuelve a su reposo al momento, sin esperar al
     temporizador: si no, PRAX se quedaba sonriendo medio segundo después de
     fallar. */
  useEffect(() => {
    setCara(caraEnReposo(mood));
  }, [mood]);

  useEffect(() => {
    if (quieto) return;

    /* La preferencia se consulta aquí y no con una clase CSS porque lo que hay
       que apagar no es una transición, es un `setTimeout` que cambia el texto. */
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const gestos = PRAX_FACES[mood];
    const [minimo, maximo] = RITMO[mood];
    let vuelta: ReturnType<typeof setTimeout>;

    function programar(): ReturnType<typeof setTimeout> {
      const espera = minimo + Math.random() * (maximo - minimo);
      return setTimeout(() => {
        /* De la lista sin contar el reposo, que ya es lo que se está viendo. */
        const gesto = gestos[1 + Math.floor(Math.random() * (gestos.length - 1))];
        setCara(gesto);
        vuelta = setTimeout(() => setCara(caraEnReposo(mood)), DURACION_DEL_GESTO);
        siguiente = programar();
      }, espera);
    }

    let siguiente = programar();
    return () => {
      clearTimeout(siguiente);
      clearTimeout(vuelta);
    };
  }, [mood, quieto]);

  return (
    <span
      role="img"
      aria-label={PRAX_LABELS[mood]}
      title={PRAX_LABELS[mood]}
      className={`inline-flex shrink-0 select-none items-center justify-center font-mono font-bold leading-none ${medidas.radio} ${medidas.caja} ${medidas.cara} ${className}`}
      style={{
        background: `linear-gradient(140deg, ${colors.primary}, ${colors.primaryHover})`,
        color: colors.primaryForeground,
        /* Un anillo del color de la marca, muy tenue: separa la ficha del fondo
           en tema claro, donde el violeta sobre blanco se queda plano. */
        boxShadow: `0 0 0 1px ${alpha(colors.primary, 30)}`,
        /* Los tres caracteres, siempre a la misma anchura. Sin esto, `^-^` y
           `o_o` no miden lo mismo en algunas monoespacio y la cara «baila»
           dentro del cuadrado al cambiar de gesto. */
        fontVariantLigatures: 'none',
        letterSpacing: '-0.02em',
      }}
    >
      {/* La cara sube un pelo: los guiones bajos y las `o` tiran del peso hacia
          abajo, y centrada geométricamente parece descolgada. */}
      <span style={{ transform: 'translateY(-0.04em)' }}>{cara}</span>
    </span>
  );
}
