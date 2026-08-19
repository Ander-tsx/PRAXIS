import { alpha, colors } from '@praxis/commons';

/**
 * Las formas que sabe dibujar la miniatura.
 *
 * Son las cinco de `FormaGrafico` más tres que no son formas del constructor
 * sino de los informes fijos del catálogo: una cifra grande, una nube de puntos
 * y una lista. Sin ellas, la mitad de las tarjetas del catálogo tendrían que
 * enseñar una forma que no es la suya, que es peor que no enseñar ninguna.
 */
export type VistaMini =
  | 'barras'
  | 'barras_horizontales'
  | 'dona'
  | 'lineas'
  | 'area_apilada'
  | 'cifras'
  | 'dispersion'
  | 'lista';

/**
 * La forma de un grafo, en 56×36 píxeles.
 *
 * ## Por qué existe
 *
 * El catálogo era una lista de tarjetas **de texto**: un título y una frase de
 * dos líneas por cada uno de los ocho. Elegir «flujo acumulado» exigía leerse la
 * frase y traducirla mentalmente a una imagen, y quien no supiera qué es un
 * diagrama de flujo acumulado no lo sabía tampoco después de leerla.
 *
 * Una forma se reconoce antes de leerla. La frase se queda —sigue haciendo falta
 * para saber **qué mide**— pero deja de ser lo primero.
 *
 * ## ⚠️ Es decorativa, y por eso `aria-hidden`
 *
 * No añade información que no esté en el texto de al lado: es un atajo visual
 * para quien lo ve. Anunciarla sería leer «gráfico de barras» antes del nombre
 * del informe, que es exactamente el orden equivocado.
 *
 * ## ⚠️ Sin datos reales, y a propósito
 *
 * Las alturas son constantes escritas a mano. La tentación de pintar aquí una
 * muestra del proyecto es fuerte y está mal: en un proyecto sin historial la
 * miniatura saldría plana, y una fila de barras a cero se lee como «este gráfico
 * no sirve» cuando lo que pasa es que aún no hay nada que enseñar. La miniatura
 * dice **qué forma tiene**, no qué valores va a tener.
 */
export function MiniGrafo({ vista, tono }: { vista: VistaMini; tono?: string }) {
  const color = tono ?? colors.primary;
  const suave = alpha(color, 35);
  const tenue = alpha(color, 18);

  return (
    <svg
      viewBox="0 0 56 36"
      className="h-9 w-14 shrink-0"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {vista === 'barras' && (
        <g fill={color}>
          <rect x="4" y="20" width="9" height="14" rx="1.5" fillOpacity="0.45" />
          <rect x="17" y="10" width="9" height="24" rx="1.5" />
          <rect x="30" y="16" width="9" height="18" rx="1.5" fillOpacity="0.7" />
          <rect x="43" y="25" width="9" height="9" rx="1.5" fillOpacity="0.3" />
        </g>
      )}

      {vista === 'barras_horizontales' && (
        <g fill={color}>
          <rect x="4" y="5" width="46" height="7" rx="1.5" />
          <rect x="4" y="15" width="30" height="7" rx="1.5" fillOpacity="0.6" />
          <rect x="4" y="25" width="17" height="7" rx="1.5" fillOpacity="0.35" />
        </g>
      )}

      {vista === 'dona' && (
        <>
          <circle cx="28" cy="18" r="12" stroke={tenue} strokeWidth="7" />
          {/* Un arco de ~2/3 de vuelta: una dona completa no se distingue de un
              anillo, y lo que hace reconocible a esta forma es el corte. */}
          <circle
            cx="28"
            cy="18"
            r="12"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="48 76"
            transform="rotate(-90 28 18)"
          />
        </>
      )}

      {vista === 'lineas' && (
        <>
          <polyline
            points="4,27 15,18 26,22 37,9 52,13"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="37" cy="9" r="3" fill={color} />
        </>
      )}

      {vista === 'area_apilada' && (
        <>
          <path d="M4 34 L4 24 L18 18 L32 21 L52 12 L52 34 Z" fill={suave} />
          <path d="M4 34 L4 30 L18 27 L32 29 L52 24 L52 34 Z" fill={color} fillOpacity="0.75" />
        </>
      )}

      {/**
       * ⚠️ Esto empezó siendo cuatro rectángulos bajos y se leía como **dos
       * rayas grises**, no como cifras: junto a las barras y la dona, la tarjeta
       * del resumen parecía la única sin dibujo. Un número grande se reconoce por
       * su **altura** frente a su rótulo, así que la proporción entre los dos
       * bloques es la información — no el color.
       */}
      {vista === 'cifras' && (
        <g fill={color}>
          <rect x="4" y="6" width="18" height="15" rx="3" />
          <rect x="4" y="25" width="18" height="4" rx="2" fillOpacity="0.4" />
          <rect x="34" y="10" width="18" height="11" rx="3" fillOpacity="0.55" />
          <rect x="34" y="25" width="18" height="4" rx="2" fillOpacity="0.4" />
        </g>
      )}

      {vista === 'dispersion' && (
        <g fill={color}>
          <circle cx="9" cy="26" r="2.5" />
          <circle cx="18" cy="19" r="2.5" fillOpacity="0.7" />
          <circle cx="24" cy="28" r="2.5" fillOpacity="0.5" />
          <circle cx="33" cy="14" r="2.5" />
          <circle cx="41" cy="22" r="2.5" fillOpacity="0.7" />
          <circle cx="48" cy="10" r="2.5" fillOpacity="0.5" />
          <line
            x1="4"
            y1="24"
            x2="52"
            y2="14"
            stroke={suave}
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        </g>
      )}

      {vista === 'lista' && (
        <g fill={color}>
          <circle cx="8" cy="9" r="3" />
          <rect x="16" y="7" width="36" height="4" rx="2" fillOpacity="0.55" />
          <circle cx="8" cy="18" r="3" fillOpacity="0.7" />
          <rect x="16" y="16" width="28" height="4" rx="2" fillOpacity="0.4" />
          <circle cx="8" cy="27" r="3" fillOpacity="0.45" />
          <rect x="16" y="25" width="32" height="4" rx="2" fillOpacity="0.3" />
        </g>
      )}
    </svg>
  );
}
