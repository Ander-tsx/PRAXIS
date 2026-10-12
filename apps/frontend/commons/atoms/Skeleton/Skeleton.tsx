import { alpha, colors } from '../../tokens';

/**
 * Las piezas con las que se dibuja el esqueleto de una pantalla.
 *
 * ## Por qué no una librería
 *
 * Se miró (`react-loading-skeleton` y compañía). No entran, y no por
 * purismo: lo que hace útil a un esqueleto es que **tenga la forma de la
 * pantalla concreta**, y eso hay que escribirlo pantalla por pantalla se use la
 * librería que se use. Lo único que aportarían es el rectángulo gris que
 * animan, que aquí son dos clases de Tailwind — a cambio de una dependencia con
 * su propio tema y su propio CSS, que habría que reconciliar con los tokens
 * `--color-*` y con la sobreescritura `[data-tone="dark"]`. Se paga el coste y
 * no se compra la parte difícil.
 *
 * ## El tono es un velo, no un gris
 *
 * ⚠️ **`alpha(textPrimary)` y no un `var(--color-surface-2)` literal**, que es como estaba en
 * los cuatro `loading.tsx` que había. Un hex fijo solo funciona sobre la
 * superficie para la que se eligió: el mismo bloque cae sobre `surface` en una
 * pantalla normal y sobre `surface-elevated` dentro de un panel, y en tema
 * claro desaparece. Un velo del color del texto funciona sobre cualquier fondo
 * y en los dos temas, que es justo lo que CLAUDE.md pide al prohibir escribir
 * colores a pelo.
 *
 * ## Ninguna de estas piezas es de cliente
 *
 * Sin `'use client'`, sin estado y sin hooks: un `loading.tsx` se renderiza en
 * el servidor y mandarlas al navegador sería bulto en el bundle de cada
 * pantalla a cambio de nada. `colors` y `alpha` son cadenas `var(--…)` y
 * `color-mix(…)`, así que resuelven en CSS sin JavaScript detrás.
 */

/** El velo. Un solo sitio: cuatro copias del mismo gris acaban con una distinta. */
const VELO = alpha(colors.textPrimary, 7);
/** El de las piezas que van encima de otra pieza, para que se separen. */
const VELO_FUERTE = alpha(colors.textPrimary, 11);

export interface SkeletonProps {
  /** Alto, ancho y redondeo, en clases. Es lo único que cambia entre bloques. */
  className?: string;
  /** Más marcado, para lo que va encima de otro bloque. */
  fuerte?: boolean;
}

/**
 * Un bloque. La pieza de la que se hace todo lo demás.
 *
 * ⚠️ **No lleva alto por defecto a propósito.** Un bloque sin `h-*` mide cero y
 * se ve el fallo enseguida; uno con un alto de relleno se cuela en una pantalla
 * pareciendo que mide lo que debe.
 */
export function Skeleton({ className = '', fuerte = false }: SkeletonProps) {
  return (
    <div
      className={`animate-presione rounded-lg ${className}`}
      style={{ background: fuerte ? VELO_FUERTE : VELO }}
    />
  );
}

/** Un círculo: avatares y monogramas. `size` es el diámetro en clases. */
export function SkeletonCircle({ className = '', fuerte = false }: SkeletonProps) {
  return (
    <div
      className={`animate-presione rounded-full ${className}`}
      style={{ background: fuerte ? VELO_FUERTE : VELO }}
    />
  );
}

/**
 * Varias líneas de texto.
 *
 * ⚠️ **La última sale más corta**, y no es un adorno: un párrafo real casi nunca
 * termina justo en el margen, y un bloque de líneas idénticas se lee como una
 * tabla, no como texto. Es la señal que hace que el ojo lo interprete como
 * prosa antes de que llegue la de verdad.
 */
export function SkeletonText({
  lineas = 3,
  className = '',
}: {
  lineas?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lineas }, (_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: son cajas decorativas sin identidad ni orden que pueda cambiar
          key={i}
          className={`h-3.5 ${i === lineas - 1 ? 'w-2/5' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/**
 * Una fila con raya inferior: el patrón de listado de todo el producto —los
 * miembros del equipo, las cuentas de administración, los archivos de una
 * tarea— que `kyloo-design/SKILL.md` §4 resume como «filas, no tarjetas».
 *
 * Se pinta la raya y no un rectángulo por fila porque es lo que hay debajo: un
 * listado de verdad son filas separadas por una línea, y un esqueleto de cajas
 * macizas anuncia una pantalla que no va a salir.
 */
export function SkeletonRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-4 border-b py-4 last:border-b-0"
      style={{ borderColor: alpha(colors.textPrimary, 8) }}
    >
      {children}
    </div>
  );
}
