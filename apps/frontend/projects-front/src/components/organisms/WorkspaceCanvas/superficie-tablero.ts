/**
 * Superficie del tablero.
 *
 * ⚠️ **Se retiró la retícula de puntos** en el rediseño de la pantalla de
 * proyecto: sobre el fondo negro de marca los puntos apenas se veían y sumaban
 * ruido. Queda un hundido suave —dos sombras `inset`, una corta y densa y otra
 * larga— para que el tablero se lea como una superficie rebajada en la página y
 * no como un rectángulo dibujado encima.
 */
export const BOARD_SURFACE = {
  background: '#0a0a09',
  boxShadow: [
    'inset 0 0 24px 2px rgba(0, 0, 0, 0.55)',
    'inset 0 0 72px 24px rgba(0, 0, 0, 0.35)',
  ].join(', '),
} as const;
