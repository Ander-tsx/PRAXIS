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

export const CHAT_REF_KINDS = ['user', 'project', 'workspace', 'board', 'task'] as const;
export type ChatRefKind = (typeof CHAT_REF_KINDS)[number];

/** **Espejo exacto** de `CHAT_REF_PATTERN` en `@praxis/contracts`. */
const PATRON_REFERENCIA =
  /([@/])\[([^\]\n]{1,120})\]\((user|project|workspace|board|task):([0-9a-fA-F-]{36})\)/g;

/** Un trozo de mensaje: texto suelto o una etiqueta. */
export type ChatToken =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'ref'; sigil: '@' | '/'; kind: ChatRefKind; id: string; label: string };

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
  const trozos: ChatToken[] = [];
  let desde = 0;

  let coincidencia = patron.exec(cuerpo);
  while (coincidencia !== null) {
    if (coincidencia.index > desde) {
      trozos.push({ tipo: 'texto', texto: cuerpo.slice(desde, coincidencia.index) });
    }

    trozos.push({
      tipo: 'ref',
      sigil: coincidencia[1] as '@' | '/',
      label: coincidencia[2] as string,
      kind: coincidencia[3] as ChatRefKind,
      id: (coincidencia[4] as string).toLowerCase(),
    });

    desde = coincidencia.index + coincidencia[0].length;
    coincidencia = patron.exec(cuerpo);
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
  return trocearMensaje(cuerpo)
    .map((trozo) => (trozo.tipo === 'texto' ? trozo.texto : `${trozo.sigil}${trozo.label}`))
    .join('');
}
