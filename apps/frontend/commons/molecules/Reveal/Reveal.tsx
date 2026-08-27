'use client';

import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useInView } from '../../hooks';

/**
 * El reveal estándar: `y: 150% → 0`, `opacity: 0 → 1`, sobre `--ease-transition`,
 * una vez, cuando el elemento cruza el 80% del viewport.
 *
 * Sustituye a los `gsap.fromTo` + `ScrollTrigger` sueltos que tenía cada
 * organismo de la landing: un `IntersectionObserver` que dispara una vez y una
 * transición CSS no dependen de que el hilo principal esté libre en el
 * fotograma exacto en que GSAP evalúa el scroll, así que no se quedan a medias
 * bajo carga.
 */
export function Reveal({
  as: Tag = 'div',
  children,
  className,
  innerClassName,
  delay = 0,
  duration = 1.075,
  style,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  delay?: number;
  duration?: number;
  /** Se aplica al elemento exterior (la máscara), no al que anima. */
  style?: CSSProperties;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();

  return (
    <Tag
      ref={ref}
      className={['reveal-mask', className].filter(Boolean).join(' ')}
      data-inview={inView || undefined}
      style={style}
    >
      <span
        className={['reveal-inner', innerClassName].filter(Boolean).join(' ')}
        style={{ transitionDelay: `${delay}s`, transitionDuration: `${duration}s` }}
      >
        {children}
      </span>
    </Tag>
  );
}
