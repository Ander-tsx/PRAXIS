/**
 * Menciones y referencias dentro del texto de un mensaje.
 *
 *     @[Juan Pérez](user:2222…)        una mención a una persona
 *     /[Sprint 1](board:88ab…)         una referencia a algo del proyecto
 *
 * ⚠️ **El nombre va escrito dentro del mensaje a propósito.** Si la referencia
 * fuese solo un id, el día que saquen a Juan del equipo o borren el tablero
 * habría que elegir entre dejar un hueco, pintar un UUID o consultar algo que ya
 * no existe. Con el nombre dentro, degradar es **no hacer nada**: se pinta el
 * texto tal cual, sin una sola consulta.
 *
 * Es también lo que hace que un mensaje viejo se lea como se escribió: si
 * alguien renombra el tablero, la frase de hace tres meses sigue diciendo lo que
 * decía. En una conversación eso es lo correcto — es el registro de lo que se
 * dijo, no una vista de datos actuales.
 *
 * Espejo de `chat-refs.ts` en `@praxis/contracts`.
 */

import { colors } from '../tokens';

export const CHAT_REF_KINDS = ['user', 'project', 'workspace', 'board', 'task'] as const;
export type ChatRefKind = (typeof CHAT_REF_KINDS)[number];

/**
 * El color de cada tipo de referencia — **la única fuente**, para que una
 * mención se vea del mismo color en todas partes: mientras se escribe (el
 * resaltado del compositor), en el desplegable de `/` y ya enviada
 * (`RichText`). Estuvo repetido en los tres sitios y se desincronizó: un
 * tablero salía verde en el compositor y azul en el mensaje ya enviado,
 * porque el compositor solo distinguía «mención» de «lo demás» y `/` ya no es
 * solo tareas.
 */
export const COLOR_POR_TIPO_DE_REF: Record<ChatRefKind, string> = {
  user: colors.primary,
  project: colors.accent,
  workspace: colors.accent,
  board: colors.info,
  task: colors.success,
};

/** **Espejo exacto** de `CHAT_REF_PATTERN` en `@praxis/contracts`. */
const PATRON_REFERENCIA =
  /([@/])\[([^\]\n]{1,120})\]\((user|project|workspace|board|task):([0-9a-fA-F-]{36})\)/g;

/**
 * Una URL de http/https, sin paréntesis de cierre ni coma final ni punto final.
 *
 * El `\(` se incluye **después** del esquema, no dentro del grupo de contenido:
 * una URL de Wikipedia tipo `https://es.wikipedia.org/wiki/Algo_(musica)` lleva
 * paréntesis internos y debe casar entera, así que el cierre solo se come un
 * `)` si va al final del token. La coma y el punto del final son puntuación del
 * idioma y no parte de la URL — `Mira https://x.com, ok` deja la coma fuera.
 *
 * El `(?<!\]\()` del principio excluye la URL que es destino de un enlace con
 * alias `[texto](https://…)`: esa se queda dentro del texto para que el render
 * de Markdown la recoja entera con su etiqueta, en vez de partirla aquí.
 */
const PATRON_URL = /(?<!\]\()(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

/**
 * Puntuación del final de frase que un idioma deja pegada a la URL y no es
 * parte de ella: «Mira https://x.com, ok» deja la coma fuera. Un punto dentro
 * de la ruta (`/v1.2`) o un paréntesis (`.../Algo_(musica)`) se conservan.
 */
const PUNTUACION_FINAL = /[.,;:!?]+$/;

/** Un trozo de mensaje: texto suelto, una etiqueta o una URL. */
export type ChatToken =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ref'; sigil: '@' | '/'; kind: ChatRefKind; id: string; label: string }
  | { tipo: 'url'; url: string };

/**
 * Parte el cuerpo de un mensaje en texto y etiquetas, **en orden**.
 *
 * ⚠️ Se crea una expresión nueva en cada llamada en vez de reutilizar la
 * constante: las expresiones con bandera `g` **guardan `lastIndex` entre usos**,
 * así que compartir una instancia hace que la segunda llamada empiece por la
 * mitad. Es un fallo que solo aparece a partir del segundo mensaje de la lista.
 */
export function trocearMensaje(cuerpo: string): ChatToken[] {
  const patron = new RegExp(PATRON_REFERENCIA.source, 'g');
  const patronUrl = new RegExp(PATRON_URL.source, 'g');
  const trozos: ChatToken[] = [];
  let desde = 0;

  while (desde < cuerpo.length) {
    /* `lastIndex` se fija a `desde` en cada vuelta: con bandera `g` cada `exec`
       avanza el puntero del patrón, y si la otra expresión gana el tramo, el
       patrón que perdió habría quedado buscando más allá de `desde` — un
       solape haría que una etiqueta dentro de una URL consumida se colara. */
    patron.lastIndex = desde;
    patronUrl.lastIndex = desde;
    const ref = patron.exec(cuerpo);
    const url = patronUrl.exec(cuerpo);

    if (!ref && !url) break;

    if (ref && (!url || ref.index <= url.index)) {
      const indice = ref.index;
      if (indice > desde) {
        trozos.push({ tipo: 'texto', texto: cuerpo.slice(desde, indice) });
      }
      trozos.push({
        tipo: 'ref',
        sigil: ref[1] as '@' | '/',
        label: ref[2] as string,
        kind: ref[3] as ChatRefKind,
        id: (ref[4] as string).toLowerCase(),
      });
      desde = indice + ref[0].length;
    } else if (url) {
      const indice = url.index;
      if (indice > desde) {
        trozos.push({ tipo: 'texto', texto: cuerpo.slice(desde, indice) });
      }
      const urlLimpia = url[0].replace(PUNTUACION_FINAL, '');
      trozos.push({ tipo: 'url', url: urlLimpia });
      desde = indice + url[0].length;
    }
  }

  if (desde < cuerpo.length) trozos.push({ tipo: 'texto', texto: cuerpo.slice(desde) });

  return trozos;
}

/** Construye una etiqueta para insertarla en el texto que se está escribiendo. */
export function componerReferencia(kind: ChatRefKind, id: string, label: string): string {
  const sigil = kind === 'user' ? '@' : '/';
  /* Corchetes y saltos fuera: son lo único que podría cerrar la etiqueta antes
     de tiempo y romper el resto del mensaje. */
  const limpio = label
    .replace(/[[\]\n]/g, ' ')
    .trim()
    .slice(0, 120);
  return `${sigil}[${limpio}](${kind}:${id})`;
}

/**
 * El texto sin etiquetas, para sitios donde no se puede pintar nada rico: el
 * resumen de la bandeja, el título de la pestaña, un `title`.
 *
 * Deja el nombre y se come la maquinaria, que es lo que alguien esperaría leer.
 */
export function textoPlano(cuerpo: string): string {
  const texto = trocearMensaje(cuerpo)
    .map((trozo) =>
      trozo.tipo === 'texto'
        ? trozo.texto
        : trozo.tipo === 'url'
          ? trozo.url
          : `${trozo.sigil}${trozo.label}`,
    )
    .join('');
  return quitarMarkup(texto);
}

/**
 * El texto de un mensaje, o qué es si no tiene texto.
 *
 * Un mensaje puede ser solo un archivo —`body` vacío—, y `textoPlano('')` es
 * una cadena vacía: la cita, la barra de fijados o un resultado de búsqueda se
 * verían con el nombre de quien escribió y nada más, como si el mensaje
 * estuviera roto. Aquí se dice qué es, no el nombre del archivo —ese no
 * importa para reconocer el mensaje, y sí para el ruido visual.
 */
export type TipoDeAdjunto = 'imagen' | 'video' | 'archivo';

export interface PreviewDeMensaje {
  texto: string;
  /** `null` cuando el mensaje tiene texto propio: no hace falta decir qué es. */
  tipoAdjunto: TipoDeAdjunto | null;
}

export function previewDeMensaje(mensaje: {
  body: string;
  attachments: { mimeType: string }[];
}): PreviewDeMensaje {
  const texto = textoPlano(mensaje.body).trim();
  if (texto) return { texto, tipoAdjunto: null };

  const primero = mensaje.attachments[0];
  if (!primero) return { texto: '', tipoAdjunto: null };
  if (primero.mimeType.startsWith('image/')) return { texto: 'Imagen', tipoAdjunto: 'imagen' };
  if (primero.mimeType.startsWith('video/')) return { texto: 'Vídeo', tipoAdjunto: 'video' };
  return { texto: 'Archivo', tipoAdjunto: 'archivo' };
}

/**
 * Se come los marcadores de Markdown y deja solo el contenido, para los sitios
 * de texto plano. `**negrita**` → `negrita`, `` `código` `` → `código`,
 * `[texto](https://x)` → `texto`, `- ítem` → `ítem`. Es el espejo de lo que
 * `RichText` pinta: ambos usan la misma idea, pero aquí no hay nada que render.
 */
export function quitarMarkup(texto: string): string {
  return (
    texto
      /* Código y enlaces con alias primero: sus `[ ]` y `(` no deben confundir
         a la negrita ni a los paréntesis de un enlace normal. */
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^)\s]+)\)/g, '$1')
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/~~([^~\n]+)~~/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      /* Viñetas de lista: al inicio de línea o tras un salto. */
      .replace(/(^|\n)[-*] /g, '$1')
  );
}
