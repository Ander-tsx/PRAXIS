/**
 * PRAXIS — Animation Tokens
 * Duraciones y easings para transiciones y animaciones.
 * Respetar siempre prefers-reduced-motion para animaciones decorativas.
 */

export const duration = {
  fast: '100ms', // Hover rings, color transitions inmediatas
  base: '150ms', // Botones, inputs — la mayoría de interacciones
  normal: '200ms', // Transiciones de estado
  slow: '300ms', // Hover de cards, slides sutiles
  slower: '350ms', // Modales entrando
  xslow: '500ms', // Page transitions, loaders
  // GSAP
  gsapBase: 0.6, // segundos — animaciones de scroll reveal
  gsapSlow: 0.8,
  gsapXSlow: 0.9,
} as const;

export const easing = {
  // CSS
  linear: 'linear',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // spring/bounce
  smooth: 'cubic-bezier(0.22, 1, 0.36, 1)', // fast in, slow out
  // GSAP
  power3out: 'power3.out',
  backOut: 'back.out(1.7)',
  power2in: 'power2.in',
} as const;

/** Transition CSS shorthands para uso en style={{}} */
export const transition = {
  fast: `all ${duration.fast} ${easing.easeOut}`,
  base: `all ${duration.base} ${easing.easeInOut}`,
  slow: `all ${duration.slow} ${easing.smooth}`,
  colors: `color ${duration.base} ${easing.easeInOut}, background-color ${duration.base} ${easing.easeInOut}, border-color ${duration.base} ${easing.easeInOut}`,
} as const;

/** Nombres de keyframes definidos en globals.css — no duplicar aquí */
export const keyframeNames = {
  echofloat: 'echo-float',
  ledPulse: 'led-presione',
  bubbleIn: 'bubble-in',
  kanbanSlide: 'kanban-slide',
  shimmer: 'shimmer-move',
  sparkleSpin: 'sparkle-spin',
  drift1: 'drift-1',
  drift2: 'drift-2',
  drift3: 'drift-3',
} as const;
