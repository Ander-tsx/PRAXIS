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
 * La cara, como texto.
 *
 * ## ⚠️ Los caracteres están elegidos, no improvisados
 *
 * Todo lo que hay aquí es de los bloques **más comunes de Unicode**: el punto
 * medio `•` (U+2022), la omega griega `ω` (U+03C9), y ASCII puro. La tentación
 * era usar los kaomoji «de verdad» —`•ᴗ•`, `•‿•`— pero `ᴗ` (U+1D17) y `‿`
 * (U+203F) faltan en muchas fuentes de sistema, y una cara que se cae a un
 * rectángulo vacío es peor que no tener cara: parece un fallo de codificación,
 * que es justo lo contrario de «tierno».
 *
 * Se dibuja como texto y no como trazados SVG a propósito. La gracia de una cara
 * ASCII es que **es** texto: se puede copiar, escala con la tipografía y se
 * cambia editando una cadena. Un trazado sería más robusto y ya no sería la
 * misma idea.
 */
export const PRAX_FACES: Record<PraxMood, string> = {
  idle: '•ω•',
  /* Los ojos cerrados: está en lo suyo. */
  thinking: '-ω-',
  /* Los ojos arqueados hacia arriba, que es como se sonríe de verdad. */
  happy: '^ω^',
  /* Apretados. Ni asustado ni enfadado: incómodo, que es lo que toca cuando el
     que ha fallado eres tú. */
  oops: '>ω<',
};

/** Qué se dice de cada estado, para quien no ve la cara. */
const PRAX_LABELS: Record<PraxMood, string> = {
  idle: `${PRAX_NAME}, listo`,
  thinking: `${PRAX_NAME} está pensando`,
  happy: `${PRAX_NAME} ha respondido`,
  oops: `${PRAX_NAME} no ha podido`,
};

export type PraxSize = 'sm' | 'md' | 'lg';

/**
 * Caja y tamaño de letra.
 *
 * Van juntos y no se derivan uno del otro porque **no escalan igual**: la cara
 * son tres caracteres, así que en la caja pequeña el texto tiene que encoger más
 * que proporcionalmente o toca los bordes.
 *
 * - `sm` — dentro de una burbuja de conversación, al lado del texto.
 * - `md` — una cabecera o una fila de menú.
 * - `lg` — la portada de su pantalla, donde la cara **es** el contenido.
 */
const MEDIDAS: Record<PraxSize, { caja: string; cara: string }> = {
  sm: { caja: 'h-7 w-7', cara: 'text-[9px]' },
  md: { caja: 'h-10 w-10', cara: 'text-[13px]' },
  lg: { caja: 'h-20 w-20', cara: 'text-[26px]' },
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
 * 3. **Escala** de 28 px en una burbuja a 80 px en su portada sin borrarse.
 * 4. **Tiene estados**, que es lo que la convierte en información y no en adorno:
 *    mientras el modelo tarda, esta cara es lo único que dice que sigue vivo.
 *
 * ⚠️ El degradado va en `background` inline y no en una clase de Tailwind porque
 * se construye con `alpha()` sobre los tokens; una utilidad literal no puede
 * interpolar eso, y un token que solo se consume así **se recorta del CSS final
 * en silencio** si no está en `@theme static` — la trampa que ya documenta
 * `theme.css`.
 */
export function PraxAvatar({ mood = 'idle', size = 'md', className = '' }: PraxAvatarProps) {
  const medidas = MEDIDAS[size];

  return (
    <span
      role="img"
      aria-label={PRAX_LABELS[mood]}
      title={PRAX_LABELS[mood]}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-[30%] font-mono font-bold leading-none tracking-tight ${medidas.caja} ${medidas.cara} ${className}`}
      style={{
        background: `linear-gradient(140deg, ${colors.primary}, ${colors.primaryHover})`,
        color: colors.primaryForeground,
        /* Un anillo del color de la marca, muy tenue: separa la ficha del fondo
           en tema claro, donde el violeta sobre blanco se queda plano. */
        boxShadow: `0 0 0 1px ${alpha(colors.primary, 30)}`,
      }}
    >
      <span
        /* La cara sube un pelo: `ω` tiene el peso abajo y centrada ópticamente
           parece descolgada dentro del cuadrado. */
        className={mood === 'thinking' ? 'animate-pulse' : undefined}
        style={{ transform: 'translateY(-0.06em)' }}
      >
        {PRAX_FACES[mood]}
      </span>
    </span>
  );
}
