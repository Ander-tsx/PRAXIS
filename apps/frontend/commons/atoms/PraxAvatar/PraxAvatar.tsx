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
 * La cara de cada estado.
 *
 * ## ⚠️ Es ASCII de verdad, y eso fue una decisión
 *
 * Todo lo que hay aquí sale del teclado: `^ - o _ < >`. Una versión intermedia
 * usó `ω` (U+03C9) buscando un kaomoji más «mono», y no valía: en una fuente
 * monoespacio esa letra es ancha, se descuelga por abajo y arrastra la cara
 * fuera del centro del cuadrado. Con ASCII puro **cae siempre donde tiene que
 * caer**, en cualquier fuente y a cualquier tamaño.
 *
 * ## ⚠️ Y no se anima, aunque se probó
 *
 * Hubo una versión con varios fotogramas por estado —parpadeos, miradas de
 * lado— que se alternaban con pausas sorteadas. Se quitó a petición, y con
 * razón: una cara que gesticula sola en una esquina de la pantalla **pide
 * atención constantemente** mientras estás leyendo otra cosa, y la información
 * que aportaba ya la da el estado.
 *
 * Lo que se conserva es lo que sí informa: que la cara **cambia con lo que está
 * pasando**. Eso no es animación, es estado — y sin ello, un asistente que tarda
 * ocho segundos parece colgado.
 */
export const PRAX_FACES: Record<PraxMood, string> = {
  /* De frente y contento de estar ahí. La cara por defecto de todo el producto. */
  idle: '^-^',
  /* Los ojos muy abiertos: está mirando sus datos, no sufriendo. */
  thinking: 'o_o',
  /* Ojos arqueados hacia arriba, que es como se sonríe de verdad. */
  happy: '^o^',
  /* Apretados. Ni asustado ni enfadado: incómodo, que es lo que toca cuando el
     que ha fallado eres tú. */
  oops: '>_<',
};

/** Qué se dice de cada estado, para quien no ve la cara. */
const PRAX_LABELS: Record<PraxMood, string> = {
  idle: `${PRAX_NAME}, listo`,
  thinking: `${PRAX_NAME} está pensando`,
  happy: `${PRAX_NAME} ha respondido`,
  oops: `${PRAX_NAME} no ha podido`,
};

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
 * 4. **Cambia con el estado**, que es lo que la convierte en información y no en
 *    adorno: mientras el modelo tarda, esta cara es lo único que dice que sigue
 *    vivo.
 *
 * Es un componente **de servidor**: sin estado, sin efectos y sin `'use client'`.
 * Lo fue de cliente mientras tuvo gestos animados; al quitarlos, arrastrar toda
 * una isla de JavaScript para pintar tres caracteres dejó de tener sentido.
 *
 * ⚠️ El degradado va en `background` inline y no en una clase de Tailwind porque
 * se construye con `alpha()` sobre los tokens; una utilidad literal no puede
 * interpolar eso, y un token que solo se consume así **se recorta del CSS final
 * en silencio** si no está en `@theme static` — la trampa que documenta
 * `theme.css`.
 */
export function PraxAvatar({ mood = 'idle', size = 'md', className = '' }: PraxAvatarProps) {
  const medidas = MEDIDAS[size];

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
      <span style={{ transform: 'translateY(-0.04em)' }}>{PRAX_FACES[mood]}</span>
    </span>
  );
}
