'use client';

import { ArrowUpRightIcon } from '@/components/icons';
import { l, lRadius } from '@/lib/landingColors';
import { alpha } from '@praxis/commons';
import { useState } from 'react';

/** Misma cadencia en todo el sitio: la etiqueta rueda hacia arriba y su gemela
 * entra por debajo — puramente cinético, el texto no cambia.
 *
 * ⚠️ El swap va por `style` con el estado `hovered`, no por clases
 * `group-hover/cta:translate-*` de Tailwind. Con dos utilidades de traslado
 * en el mismo elemento (`-translate-x-full` + `translate-y-full`), Tailwind
 * v4 compone las dos en la propiedad nativa `translate` vía variables
 * `--tw-translate-*` — y en este proyecto esas variables volvían a 0 en el
 * elemento, así que las dos flechas quedaban superpuestas en el centro en
 * vez de una dentro y otra fuera. Fijar el `transform` a mano evita
 * depender de esa composición. */
const ROLL_MS = 350;
const ROLL_EASE = 'cubic-bezier(0.16, 1, 0.35, 1)';

export interface RollCtaProps {
  href: string;
  label: string;
  size?: 'sm' | 'lg';
  variant?: 'primary' | 'ghost';
  className?: string;
  /**
   * Color explícito, para cuando el botón no vive dentro de una zona
   * (`.landing` / `.landing-light`) y por tanto `var(--l-*)` no le sirve —
   * el navbar es fijo y flota sobre las dos zonas a la vez, así que decide
   * su color por JS, no por CSS en cascada.
   */
  bgColor?: string;
  fgColor?: string;
}

/**
 * El único botón con flecha y esquina cuadrada de la landing.
 *
 * A propósito no es el patrón por defecto para cada enlace: se usa una vez en
 * el navbar y una vez en el cierre — el resto del sitio se apoya en texto
 * plano o en las filas del footer. Repetirlo en cada CTA lo habría convertido
 * en ruido en vez de en una llamada a la acción.
 *
 * ## El acento va aquí, y solo en la variante `primary`
 *
 * Era monocromo puro: blanco sobre negro en zona oscura, negro sobre blanco en
 * zona clara. Se leía bien, pero significaba que **el botón principal del
 * producto no se parecía a sí mismo dos veces seguidas** —cambiaba de color al
 * cruzar de sección— y no se parecía en nada al de dentro de la aplicación.
 *
 * Ahora `primary` lleva el morado de marca (`l.accent`), que es el mismo
 * `--color-primary` del producto. Es el único elemento de la landing que **no**
 * se invierte al cambiar de zona: eso es justo lo que lo convierte en un ancla
 * bajando por la página.
 *
 * ⚠️ **`ghost` sigue monocromo, y tiene que seguir estándolo.** Es el
 * secundario, y dos botones de color uno al lado del otro dejan de decir cuál
 * es el camino corto — que es el problema que `variante` vino a resolver en el
 * portal de facturación.
 *
 * ⚠️ **`bgColor` sigue mandando sobre el acento.** La barra fija flota sobre
 * las dos zonas y decide su color por JS; si el acento lo pisara, esa decisión
 * dejaría de tener efecto sin que nada lo dijera.
 */
export function RollCta({
  href,
  label,
  size = 'sm',
  variant = 'primary',
  className = '',
  bgColor,
  fgColor,
}: RollCtaProps) {
  const [hovered, setHovered] = useState(false);
  const isLg = size === 'lg';
  const isGhost = variant === 'ghost';
  const rollTransition = `transform ${ROLL_MS}ms ${ROLL_EASE}`;
  const bg = bgColor ?? l.accent;
  const fg = fgColor ?? l.accentForeground;
  const border = bgColor ? bgColor : l.border;

  return (
    <a
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex w-fit items-center overflow-hidden font-medium no-underline transition-transform duration-300 ease-[var(--ease-transition)] ${
        isLg
          ? 'gap-2 py-[0.3em] pr-[0.3em] pl-6 text-lg'
          : 'gap-1.5 py-[0.3em] pr-[0.3em] pl-4 text-sm'
      } ${className}`}
      style={{
        background: isGhost ? 'transparent' : bg,
        color: isGhost ? (fgColor ?? l.fg) : fg,
        border: isGhost ? `1px solid ${border}` : 'none',
        borderRadius: lRadius,
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      <span className="relative flex overflow-hidden">
        <span
          className="relative block"
          style={{
            transform: hovered ? 'translateY(-100%)' : 'translateY(0)',
            transition: rollTransition,
          }}
        >
          {label}
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-0 block"
          style={{
            transform: hovered ? 'translateY(0)' : 'translateY(100%)',
            transition: rollTransition,
          }}
        >
          {label}
        </span>
      </span>
      {/**
       * 🔴 **Se veían las dos flechas a la vez, y era un porcentaje mal
       * referido.**
       *
       * Un `translate(100%, …)` en CSS es el 100 % **del elemento que se
       * mueve**, no de su contenedor. La flecha mide `0.9em` dentro de una caja
       * de `2.1em`, así que centrada le sobran `0.6em` por lado: para salir del
       * todo necesita recorrer `0.6 + 0.9 = 1.5em`, o sea un **167 %** de sí
       * misma. Con el 100 % se quedaba a medio camino y asomaba por la esquina
       * — las dos a la vez, una entrando y otra sin haber terminado de irse.
       *
       * No se arregla subiendo el número a ojo: los dos tamaños tienen
       * proporciones distintas (`sm` necesita 150 %, `lg` 167 %) y cualquier
       * ajuste futuro del icono o de la caja lo vuelve a romper **en silencio**,
       * porque el resultado sigue siendo una animación válida.
       *
       * Lo que se mueve ahora es una **capa del tamaño de la caja**, con la
       * flecha centrada dentro. Ahí el 100 % ya es el 100 % del recorrido que
       * hay que hacer, sea cual sea el tamaño, y las dos capas nunca se solapan.
       */}
      <span
        className={`relative flex flex-none items-center justify-center overflow-hidden ${isLg ? 'h-[2.1em] w-[2.1em]' : 'h-[1.7em] w-[1.7em]'}`}
        style={{
          background: isGhost ? alpha(fgColor ?? l.fg, 8) : alpha(fg, 15),
          borderRadius: `calc(${lRadius} - 1px)`,
        }}
      >
        <span
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: hovered ? 'translate(100%, -100%)' : 'translate(0, 0)',
            transition: rollTransition,
          }}
        >
          <ArrowUpRightIcon className={isLg ? 'h-[0.9em] w-[0.9em]' : 'h-[0.85em] w-[0.85em]'} />
        </span>

        {/* La gemela que entra por abajo-izquierda. `aria-hidden` porque es la
            misma flecha repetida: anunciarla dos veces no aporta nada. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: hovered ? 'translate(0, 0)' : 'translate(-100%, 100%)',
            transition: rollTransition,
          }}
        >
          <ArrowUpRightIcon className={isLg ? 'h-[0.9em] w-[0.9em]' : 'h-[0.85em] w-[0.85em]'} />
        </span>
      </span>
    </a>
  );
}
