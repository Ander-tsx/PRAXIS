'use client';

import { ArrowUpRightAltIcon, ArrowUpRightIcon } from '@/components/icons';
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
 * Monocromo: blanco sobre negro en zona oscura, negro sobre blanco en zona
 * clara — invierte solo (`l.primary` ya resuelve al contrario del fondo de su
 * zona), nunca lleva color de marca.
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
  const bg = bgColor ?? l.primary;
  const fg = fgColor ?? l.primaryForeground;
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
      <span
        className={`relative flex flex-none items-center justify-center overflow-hidden ${isLg ? 'h-[2.1em] w-[2.1em]' : 'h-[1.7em] w-[1.7em]'}`}
        style={{
          background: isGhost ? alpha(fgColor ?? l.fg, 8) : alpha(fg, 15),
          borderRadius: `calc(${lRadius} - 1px)`,
        }}
      >
        <ArrowUpRightIcon
          className={`absolute inset-0 m-auto ${isLg ? 'h-[0.9em] w-[0.9em]' : 'h-[0.85em] w-[0.85em]'}`}
          style={{
            transform: hovered ? 'translate(100%, -100%)' : 'translate(0, 0)',
            transition: rollTransition,
          }}
        />
        <ArrowUpRightAltIcon
          aria-hidden="true"
          className={`absolute inset-0 m-auto ${isLg ? 'h-[0.9em] w-[0.9em]' : 'h-[0.85em] w-[0.85em]'}`}
          style={{
            transform: hovered ? 'translate(0, 0)' : 'translate(-100%, 100%)',
            transition: rollTransition,
          }}
        />
      </span>
    </a>
  );
}
