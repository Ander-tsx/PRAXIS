import { presenceOf } from '../../api/presence';
import { alpha, colors } from '../../tokens';

/**
 * El círculo con las iniciales de una persona.
 *
 * Existe porque había **dos** y no coincidían: la tarjeta del tablero pintaba
 * dos iniciales y en rojo cuando la tarea era tuya, y la ficha de la barra
 * lateral pintaba una sola inicial en violeta. Eran la misma persona —tú— con
 * dos caras distintas en la misma pantalla, y eso obliga a aprenderse dos veces
 * lo mismo.
 *
 * Ahora el rojo significa **una sola cosa en todo el producto**: eres tú.
 *
 * ## Por qué las iniciales van aquí y no en cada sitio
 *
 * `iniciales()` estaba dentro de `TaskCard`, con el criterio bueno; la barra
 * lateral tenía el suyo, más pobre. Al compartir el componente se comparte la
 * regla, y deja de poder divergir.
 */

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, string> = {
  /** El del tablero: cabe cuatro veces en una tarjeta sin ahogarla. */
  sm: 'h-6 w-6 text-[10px]',
  /** El de la barra lateral y las fichas de persona. */
  md: 'h-10 w-10 text-sm',
  /**
   * El retrato: solo para la pantalla de tu cuenta, donde la foto **es** el
   * contenido y se está editando.
   *
   * Existe porque ahí estaba puesto con `scale-[1.6]` sobre el mediano, y una
   * transformación no ocupa sitio en el diseño: el círculo se veía grande pero
   * seguía reservando 40 px, así que todo lo de al lado se le montaba encima y
   * había que compensarlo con márgenes a ojo.
   */
  lg: 'h-24 w-24 text-2xl',
};

/**
 * Dónde cae el punto de presencia en cada tamaño.
 *
 * El desplazamiento es proporcional: en el círculo pequeño el arco es más
 * cerrado y hay que meterse menos hacia dentro para caer sobre el borde.
 */
const PRESENCE_DOT: Record<AvatarSize, string> = {
  sm: 'bottom-[-1px] right-[-1px] h-2 w-2',
  md: 'bottom-0 right-0 h-3 w-3',
  lg: 'bottom-1.5 right-1.5 h-4 w-4 ring-[3px]',
};

export interface AvatarProps {
  /** Nombre completo, o el correo si no hay nombre. De aquí salen las iniciales. */
  label: string;
  /** Eres tú. Pinta el círculo en rojo, que es lo que lo distingue del resto. */
  mine?: boolean;
  size?: AvatarSize;
  /** Anillo del color del fondo, para que se solapen sin fundirse. */
  ring?: boolean;
  className?: string;
  title?: string;
  /**
   * La foto, ya con el proxy de la zona delante (`avatarHref`).
   *
   * Si falla al cargarse **se vuelve a las iniciales**: una foto rota deja un
   * hueco gris con el icono del navegador, que es peor que no tenerla.
   */
  src?: string | null;
  /**
   * Presencia de esa persona: pinta el puntito de color en la esquina.
   *
   * Sin valor no se pinta nada. Es lo que evita que salga un punto verde en
   * los avatares que solo ilustran —una tarjeta de tarea, una lista de
   * miembros— donde la presencia no viene al caso.
   */
  presence?: string | null;
}

export function Avatar({
  label,
  mine = false,
  size = 'sm',
  ring = false,
  className = '',
  title,
  src,
  presence,
}: AvatarProps) {
  const circulo = (
    <span
      title={title ?? label}
      className={[
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-sans font-semibold uppercase',
        SIZES[size],
        ring ? 'ring-2 ring-background' : '',
        presence ? '' : className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        mine
          ? /* `colors.error` con `textInverse` encima funciona en los dos temas
               sin condicionarlo: el par se invierte solo. */
            { background: colors.error, color: colors.textInverse }
          : { background: alpha(colors.primary, 30), color: colors.textPrimary }
      }
    >
      {/* Las iniciales **siempre están debajo**: si la foto no carga, lo que
          queda es lo de siempre y no un hueco. */}
      {iniciales(label)}
      {src && (
        /**
         * ⚠️ **La foto va de `background-image` y no en un `<img>`, y no es
         * capricho.** `Avatar` lo pintan también componentes de servidor —el
         * equipo de un proyecto, la tabla de administración— y a un `<img>`
         * había que darle un `onError` para esconderlo si la imagen falla:
         * pasar un manejador desde el servidor revienta con «Event handlers
         * cannot be passed to Client Component props» y se lleva la página
         * entera por delante.
         *
         * De fondo se consigue lo mismo **sin una línea de JavaScript**: si la
         * imagen no carga, la capa queda transparente y se ven las iniciales de
         * debajo, que es exactamente el respaldo que se quería.
         */
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${src})` }}
        />
      )}
    </span>
  );

  if (!presence) return circulo;

  const { etiqueta, color } = presenceOf(presence);

  return (
    /**
     * El punto va **fuera del círculo**, en un envoltorio.
     *
     * Dentro tendría que pelearse con el `overflow-hidden` que recorta la foto:
     * o se recorta el punto, o se deja de recortar la foto y sale cuadrada.
     */
    <span
      /**
       * ⚠️ **`h-fit`, o el punto se va al fondo de la fila.** Un contenedor
       * `flex` estira a sus hijos por defecto (`align-items: stretch`), así que
       * este envoltorio crecía hasta el alto del mensaje entero y su
       * `bottom-0` dejaba el punto colgando muy por debajo de la cara. Con el
       * alto ajustado al círculo, la esquina vuelve a ser la esquina.
       */
      className={['relative inline-flex h-fit shrink-0', className].filter(Boolean).join(' ')}
    >
      {circulo}
      <span
        title={etiqueta}
        aria-label={etiqueta}
        /**
         * ⚠️ **El punto se mete hacia dentro, no se pega al borde.**
         *
         * `bottom-0 right-0` lo coloca en la esquina de la **caja**, y la caja
         * de un círculo tiene las esquinas vacías: el punto quedaba flotando en
         * diagonal, separado de la cara. Metiéndolo un poco (`bottom-0 right-0`
         * con un desplazamiento) cae sobre el borde real del círculo, que es
         * donde se espera verlo.
         *
         * El desplazamiento es proporcional al tamaño: en el círculo pequeño el
         * arco es más cerrado y hay que entrar menos. La tabla, en
         * `PRESENCE_DOT`.
         */
        className={['absolute rounded-full ring-2 ring-surface', PRESENCE_DOT[size]].join(' ')}
        style={{ background: color }}
      />
    </span>
  );
}

/**
 * Iniciales de una persona: la primera letra de sus dos primeras palabras.
 *
 * Cortar los dos primeros caracteres del nombre parecía equivalente y no lo es:
 * «Andres Praxis» y «Andrea Ruiz» daban las dos «AN» y quedaban indistinguibles
 * en la misma tarjeta. Con una sola palabra —el caso de quien no ha puesto
 * nombre y cae al correo— sí se usan sus dos primeras letras.
 */
export function iniciales(label: string): string {
  const [primera, segunda] = label.trim().split(/\s+/).filter(Boolean);
  if (!primera) return '?';
  if (!segunda) return primera.slice(0, 2);
  return primera.charAt(0) + segunda.charAt(0);
}
