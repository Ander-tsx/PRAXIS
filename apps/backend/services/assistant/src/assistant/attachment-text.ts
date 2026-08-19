import { Logger } from '@nestjs/common';
import { ASSISTANT_TEXT_MAX_CHARS, ASSISTANT_TEXT_MIME } from '@praxis/contracts';

/**
 * El texto de un adjunto: cómo se saca y cómo se pone en el prompt.
 *
 * ## Por qué existe este archivo
 *
 * Un adjunto **moría en su turno**. Los bytes viajan con la pregunta y no se
 * reenvían nunca más —hacerlo multiplicaría el coste por la longitud del hilo y
 * acabaría comiéndose la ventana— así que dos preguntas después PRAX hablaba de
 * un documento que ya no tenía delante, y la conversación quedaba mintiendo.
 *
 * La salida es guardar **el texto** una sola vez, al subir, y volver a ponerlo
 * en el historial con un presupuesto. Aquí viven las dos mitades de eso: sacar
 * el texto (`extractoDe`) y darle forma dentro del prompt (`bloqueDeArchivo`).
 *
 * ⚠️ **El formato es el mismo que usa el turno actual** (`repartirAdjuntos` en
 * `assistant.service.ts`). Que sea uno solo no es estética: si el archivo se
 * presentara de dos maneras, el modelo tendría que aprender que
 * «ARCHIVO ADJUNTO» y lo que fuera lo otro son la misma cosa, y el turno en el
 * que se adjunta se leería distinto del turno siguiente.
 */

const log = new Logger('AttachmentText');

/** Debajo de esto, un recorte no informa: enseña un principio y corta. */
const MINIMO_UTIL = 500;

/** Lo que se sabe de un adjunto para armar su trozo de prompt. */
export interface AdjuntoConTexto {
  filename: string;
  mimeType: string;
  /** `null` si no hay contenido que reinyectar. Ver `Attachment.extract`. */
  extract: string | null;
}

/**
 * Saca el texto que se va a guardar de un archivo recién subido.
 *
 * Devuelve `null` cuando no hay nada que guardar, y eso **no es un fallo**: un
 * PDF escaneado no tiene capa de texto, y una imagen no tiene texto en absoluto.
 * Quien lo llama guarda el `null` tal cual.
 *
 * ⚠️ **No lanza nunca.** Un archivo raro no puede tumbar una subida que por lo
 * demás funcionó: el archivo se guarda igual y se comporta como los de antes de
 * que existiera esta columna —viaja en su turno y no sobrevive—, que es
 * exactamente lo que pasaba con todos hasta ahora.
 */
export async function extractoDe(datos: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<{ extract: string | null; pages: number | null }> {
  const { filename, mimeType, bytes } = datos;

  if (ASSISTANT_TEXT_MIME.includes(mimeType)) {
    const texto = bytes.toString('utf8').trim();
    return {
      extract: texto.length > 0 ? texto.slice(0, ASSISTANT_TEXT_MAX_CHARS) : null,
      pages: null,
    };
  }

  if (mimeType === 'application/pdf') {
    try {
      /**
       * ⚠️ **`unpdf` y no `pdf-parse`**, y la diferencia es concreta: `pdf-parse`
       * arrastra `@napi-rs/canvas` —un binario nativo por plataforma, 21 MB
       * desempaquetados— para algo que aquí no se usa nunca, porque de un PDF
       * solo queremos el texto. `unpdf` empaqueta una compilación de pdf.js sin
       * dependencias nativas y publica **build CJS**, que es lo que necesita
       * este servicio (`module: nodenext` sin `"type": "module"`).
       *
       * Y va con `import()` y no arriba del archivo **a propósito**: pdf.js pesa,
       * y un servicio en el que la mayoría de los turnos no llevan ningún PDF no
       * tiene por qué cargarlo al arrancar.
       */
      const { extractText, getDocumentProxy } = await import('unpdf');
      const documento = await getDocumentProxy(new Uint8Array(bytes));
      /* `totalPages` sale de la misma lectura: contar páginas aparte sería abrir
         el documento dos veces para un dato que ya está delante. */
      const { text, totalPages } = await extractText(documento, { mergePages: true });
      const limpio = text.trim();
      /* Un PDF escaneado devuelve la cadena vacía: no es un error, es que ahí no
         hay texto que sacar. Se trata como una imagen. */
      return {
        extract: limpio.length > 0 ? limpio.slice(0, ASSISTANT_TEXT_MAX_CHARS) : null,
        pages: totalPages,
      };
    } catch (error) {
      log.warn(`No se pudo leer el PDF "${filename}": ${(error as Error).message}`);
      /* Sin páginas contadas se trata como corto y viaja nativo: es lo que hacía
         antes de que existiera el tope, y un PDF que ni se deja abrir tampoco va
         a tener quinientas páginas legibles. */
      return { extract: null, pages: null };
    }
  }

  /**
   * De una imagen **no se guarda nada**, y es a propósito.
   *
   * Se estudió describirla con una segunda llamada a Gemini y se descartó: en el
   * turno en el que se adjunta, el modelo **ya la tiene delante**, y su
   * respuesta sí se guarda. Así que la descripción se pide por prompt (regla 17)
   * y queda en el hilo sin pagar una llamada más por imagen.
   *
   * ⚠️ Y el marcador que iba aquí —`[imagen adjunta: captura.png]`, la red de
   * seguridad para que PRAX no negara después que hubo una imagen— **también
   * sobra**: `bloqueSinContenido` la nombra igual a partir de `filename` y
   * `mimeType`, que siempre están, y además explica por qué ya no la tiene. Una
   * columna con un dato que se puede componer de dos que ya existen es una
   * columna que se va a quedar desincronizada.
   */
  return { extract: null, pages: null };
}

/** El archivo, con su contenido, tal y como lo lee el modelo. */
export function bloqueDeArchivo(filename: string, contenido: string, recortado: boolean): string {
  const aviso = recortado ? '\n[...] (El archivo continua; solo se ha incluido el principio.)' : '';
  return `--- ARCHIVO ADJUNTO: ${filename} ---\n${contenido}${aviso}`;
}

/**
 * El archivo del que no queda contenido, nombrado y nada más.
 *
 * Se nombra **igual**, y esa es la decisión: callarlo dejaría a PRAX negando que
 * alguna vez le pasaran esa captura, que es peor que decir que ya no la tiene
 * delante. El motivo va dentro porque no es el mismo —una imagen nunca tuvo
 * texto; un documento viejo sí y ya no cabe— y de eso depende si tiene sentido
 * pedir que lo vuelvan a mandar.
 */
export function bloqueSinContenido(filename: string, mimeType: string, porEspacio = false): string {
  if (porEspacio) {
    return `--- ARCHIVO ADJUNTO: ${filename} (no cabe ya en esta conversacion; si hace falta, pide que lo vuelvan a adjuntar) ---`;
  }
  const encabezado = mimeType.startsWith('image/') ? 'IMAGEN ADJUNTA' : 'ARCHIVO ADJUNTO';
  return `--- ${encabezado}: ${filename} (ya no lo tienes delante; lo que dijiste sobre el esta en tu propia respuesta) ---`;
}

/**
 * Pega los adjuntos de un mensaje a su texto, gastando del presupuesto.
 *
 * ⚠️ **El presupuesto se reparte del mensaje más reciente hacia atrás**, y por
 * eso esta función recibe lo que queda y devuelve lo que sobra en vez de mirar
 * el total. Lo último que se adjuntó es lo que se está usando; lo de hace ocho
 * turnos, lo que se puede recortar sin que nadie lo note.
 */
export function textoConAdjuntos(
  texto: string,
  adjuntos: AdjuntoConTexto[],
  presupuesto: number,
): { texto: string; presupuesto: number } {
  if (adjuntos.length === 0) return { texto, presupuesto };

  let queda = presupuesto;
  const trozos: string[] = [];

  for (const adjunto of adjuntos) {
    if (!adjunto.extract) {
      trozos.push(bloqueSinContenido(adjunto.filename, adjunto.mimeType));
      continue;
    }

    /**
     * ⚠️ **Primero «¿cabe entero?», y solo después el mínimo.** Al revés —que es
     * como estaba— un extracto corto se descartaba por espacio teniendo sitio de
     * sobra, porque el mínimo se miraba antes de comprobar si hacía falta
     * recortar. El mínimo existe para otra cosa: para no meter un recorte de
     * treinta caracteres, que no informa de nada y aun así ocupa.
     */
    if (adjunto.extract.length <= queda) {
      queda -= adjunto.extract.length;
      trozos.push(bloqueDeArchivo(adjunto.filename, adjunto.extract, false));
      continue;
    }

    if (queda < MINIMO_UTIL) {
      trozos.push(bloqueSinContenido(adjunto.filename, adjunto.mimeType, true));
      continue;
    }

    trozos.push(bloqueDeArchivo(adjunto.filename, adjunto.extract.slice(0, queda), true));
    queda = 0;
  }

  return { texto: [texto, ...trozos].join('\n\n'), presupuesto: queda };
}
