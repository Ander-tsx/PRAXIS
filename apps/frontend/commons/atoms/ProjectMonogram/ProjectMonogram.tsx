import { alpha, colors, serieColors } from '../../tokens';
import { iniciales } from '../Avatar';

export interface ProjectMonogramProps {
  /** El `id` del proyecto. **De aquí sale el color**, no del nombre. */
  id: string;
  /** El nombre. De aquí salen las dos letras. */
  name: string;
  /**
   * `sm` (32 px) en listas y filas; `md` (44 px) en tarjetas.
   *
   * Dos y no un número libre: son los dos sitios donde aparece, y un tamaño
   * arbitrario por cada sitio nuevo es como se pierde el «mismo proyecto, misma
   * cara» que el monograma existe para dar.
   */
  size?: 'sm' | 'md';
  /**
   * Apagado a gris, para un proyecto suspendido.
   *
   * La tarjeta entera tiene que leerse como «esto está parado», y un color de
   * marca vivo dice lo contrario.
   */
  apagado?: boolean;
  className?: string;
}

const MEDIDAS = {
  sm: 'h-8 w-8 rounded-lg text-xs',
  md: 'h-11 w-11 rounded-xl text-sm',
} as const;

/**
 * La cara de un proyecto: dos letras sobre su color.
 *
 * ## Por qué un monograma y no un icono
 *
 * Le da a cada proyecto una cara fija —mismo color y mismas iniciales siempre—
 * que se reconoce sin leer. En una lista de doce, buscar por color es
 * instantáneo y buscar por texto no.
 *
 * El color sale de `serieColors`, que existe exactamente para esto: «categorías
 * sin orden», distinguibles entre sí, revisados para daltonismo y con los mismos
 * hexadecimales en los dos temas. Un proyecto no tiene color propio, así que no
 * se inventa uno nuevo ni se reutiliza el de los estados —`success` y `error`
 * significan algo, y teñir un proyecto de rojo por azar diría que pasa algo.
 *
 * ⚠️ **El tono sale del `id`, no del nombre.** El `id` es inmutable; el nombre
 * no, y con el nombre el proyecto cambiaría de color al renombrarlo, que es
 * justo cuando más falta hace reconocerlo. Las iniciales sí salen del nombre
 * —son texto, y deben decir lo que se ve—.
 *
 * ## Por qué vive aquí y no dentro de `ProjectCard`
 *
 * Porque el mismo proyecto sale en dos sitios y **tenía dos caras**: la rejilla
 * de Proyectos con su monograma de color, y la bandeja de Mensajes con un
 * cuadrado violeta y **una sola letra**, igual para todos. Dos proyectos que
 * empezaran por la misma letra eran indistinguibles ahí, y ninguno de los dos se
 * parecía al de la rejilla. Es la misma historia de `ProjectCard`, que también
 * existía dos veces antes de subir a `commons`.
 *
 * ⚠️ Es **cuadrado con esquinas redondeadas, nunca un círculo**: el círculo es
 * de las personas (`Avatar`), y esa diferencia es lo que deja distinguir un
 * equipo de alguien sin leer nada.
 */
export function ProjectMonogram({
  id,
  name,
  size = 'sm',
  apagado = false,
  className = '',
}: ProjectMonogramProps) {
  const tono = apagado ? colors.textSecondary : tonoDe(id);

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-sans font-semibold uppercase transition-colors ${MEDIDAS[size]} ${className}`}
      style={{
        background: alpha(tono, apagado ? 14 : 16),
        color: apagado ? colors.textDisabled : tono,
        boxShadow: `inset 0 0 0 1px ${alpha(tono, 30)}`,
      }}
    >
      {iniciales(name)}
    </span>
  );
}

/**
 * El color del proyecto, estable para siempre.
 *
 * Suma de los códigos del `id` contra la paleta de series. No es un hash bueno y
 * no hace falta que lo sea: lo único que se le pide es repartir y no cambiar
 * nunca para el mismo id.
 */
function tonoDe(id: string): string {
  let suma = 0;
  for (let i = 0; i < id.length; i += 1) suma += id.charCodeAt(i);
  return serieColors[suma % serieColors.length] as string;
}
