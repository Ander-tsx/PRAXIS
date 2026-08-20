'use client';

import {
  COLOR_POR_TIPO_DE_REF,
  type ChatRefKind,
  componerReferencia,
  splitMessage,
} from '../../api/chat-refs';
import { alpha } from '../../tokens';

/**
 * El campo de texto con etiquetas disfrazadas, en una sola pieza.
 *
 * ## El problema que resuelve
 *
 * El cuerpo de un mensaje viaja con los ids dentro —`@[María](user:2222…)`—
 * porque es lo que lo hace inmune a que borren a María. Pero eso es ilegible
 * mientras se escribe, así que el campo enseña **solo el nombre** y guarda los
 * ids aparte, en `etiquetas`, para pegarlos al serializar.
 *
 * ## Por qué vive aquí y no dentro del compositor
 *
 * Estaba dentro, y al editar un mensaje ya enviado el `<textarea>` se llenaba
 * con el cuerpo crudo: quien editaba «Oye @María» veía
 * `Oye @[María García](user:2222-…)` y con tocar un carácter del UUID rompía la
 * referencia sin enterarse. El compositor y el editor tienen que disfrazar
 * igual, así que el disfraz es de los dos.
 */

/** Una etiqueta ya insertada: lo que se ve, y el id que se pega al enviar. */
export interface Etiqueta {
  kind: ChatRefKind;
  id: string;
  /** Lo que se ve en el campo: `@María García`, o el título de la tarea. */
  visible: string;
}

/** Un trozo del campo: texto suelto, o una etiqueta con su id detrás. */
export interface FieldChunk {
  texto: string;
  etiqueta?: Etiqueta;
}

/**
 * Las dos capas tienen que medir igual carácter a carácter, así que comparten
 * estas clases exactas. Cualquier diferencia de fuente o relleno desplaza el
 * resaltado respecto al cursor.
 */
export const FIELD_TYPOGRAPHY = 'px-2 py-1.5 font-sans text-sm leading-relaxed';

/** Cómo se ve una etiqueta en el campo: `@Nombre` para personas, el título si no. */
export function visibleLabel(kind: ChatRefKind, label: string): string {
  return kind === 'user' ? `@${label}` : label;
}

/**
 * Parte el texto del campo marcando cuáles de sus trozos son etiqueta.
 *
 * Recorre las etiquetas **en el orden en que se insertaron** y busca cada una a
 * partir de donde acabó la anterior. Eso resuelve dos personas con el mismo
 * nombre y, sobre todo, **una etiqueta que ya no está**: si alguien borró ese
 * trozo del texto, no se encuentra y se ignora — el mensaje sale con lo que de
 * verdad quedó escrito.
 */
export function fieldChunks(texto: string, etiquetas: Etiqueta[]): FieldChunk[] {
  const salida: FieldChunk[] = [];
  let desde = 0;

  for (const etiqueta of etiquetas) {
    const posicion = texto.indexOf(etiqueta.visible, desde);
    if (posicion === -1) continue;
    if (posicion > desde) salida.push({ texto: texto.slice(desde, posicion) });
    salida.push({ texto: etiqueta.visible, etiqueta });
    desde = posicion + etiqueta.visible.length;
  }

  if (desde < texto.length) salida.push({ texto: texto.slice(desde) });
  return salida;
}

/** Los trozos con los ids pegados: es lo que viaja al servidor. */
export function serializeField(trozos: FieldChunk[]): string {
  return trozos
    .map((trozo) =>
      trozo.etiqueta
        ? componerReferencia(
            trozo.etiqueta.kind,
            trozo.etiqueta.id,
            /* La `@` es del formato, no del nombre: se quita antes de componer. */
            trozo.etiqueta.kind === 'user' ? trozo.texto.slice(1) : trozo.texto,
          )
        : trozo.texto,
    )
    .join('');
}

/**
 * El camino de vuelta: de un cuerpo ya guardado al campo disfrazado.
 *
 * Es lo que permite editar un mensaje sin ver un UUID. Reutiliza
 * `splitMessage` —el mismo troceo con el que se pinta el mensaje— así que una
 * referencia que se pinta bien se edita bien, sin un segundo analizador que
 * pueda discrepar del primero.
 */
export function fieldFromBody(cuerpo: string): { texto: string; etiquetas: Etiqueta[] } {
  const etiquetas: Etiqueta[] = [];
  let texto = '';

  for (const trozo of splitMessage(cuerpo)) {
    if (trozo.tipo === 'ref') {
      const visible = visibleLabel(trozo.kind, trozo.label);
      etiquetas.push({ kind: trozo.kind, id: trozo.id, visible });
      texto += visible;
    } else if (trozo.tipo === 'url') {
      texto += trozo.url;
    } else {
      texto += trozo.texto;
    }
  }

  return { texto, etiquetas };
}

/**
 * La capa de debajo del campo: el mismo texto, con las etiquetas pintadas.
 *
 * Va detrás de un `<textarea>` de tinta transparente, así que **tiene que medir
 * exactamente lo mismo que él**. Ver el aviso del `box-shadow`, abajo.
 */
export function TagLayer({
  trozos,
  capaRef,
  className = '',
}: {
  trozos: FieldChunk[];
  capaRef?: React.RefObject<HTMLDivElement | null>;
  /** Tope de alto y desbordamiento: los pone quien monta el campo. */
  className?: string;
}) {
  return (
    <div
      ref={capaRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-text-primary ${FIELD_TYPOGRAPHY} ${className}`}
    >
      {trozos.map((trozo, indice) =>
        trozo.etiqueta ? (
          /**
           * ⚠️ **La etiqueta no puede ocupar ni un píxel de más, y ese era
           * el fallo del cursor.**
           *
           * Esto llevaba `px-1` y `font-medium`. Las dos cosas cambian el
           * ancho del texto: el relleno mete 8 px por etiqueta y el peso
           * cambia las métricas de cada glifo. Pero el `<textarea>` de
           * debajo —que es quien dibuja el cursor— tiene el texto **crudo**,
           * sin relleno y con el peso normal. A partir de la primera
           * etiqueta las dos capas dejaban de coincidir y el cursor
           * aparecía desplazado respecto a las letras que se veían, cada
           * vez más cuantas más etiquetas hubiera.
           *
           * La píldora se dibuja ahora con `box-shadow`, que **no ocupa
           * espacio**: extiende el fondo hacia los lados sin mover el
           * texto. El resultado se ve igual y mide exactamente lo mismo
           * que la capa de abajo.
           *
           * Si alguna vez hay que darle más aire, va por ahí — cualquier
           * `padding`, `border`, `letter-spacing` o cambio de peso vuelve
           * a desalinear el cursor.
           */
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: los trozos no tienen id propio y la lista se recalcula entera con el texto
            key={indice}
            style={{
              background: alpha(COLOR_POR_TIPO_DE_REF[trozo.etiqueta.kind], 16),
              color: COLOR_POR_TIPO_DE_REF[trozo.etiqueta.kind],
              borderRadius: 3,
              boxShadow: `0 0 0 2px ${alpha(COLOR_POR_TIPO_DE_REF[trozo.etiqueta.kind], 16)}`,
            }}
          >
            {trozo.texto}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: ídem
          <span key={indice}>{trozo.texto}</span>
        ),
      )}
    </div>
  );
}
