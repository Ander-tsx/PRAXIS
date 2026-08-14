/**
 * Menciones y referencias dentro del texto de un mensaje.
 *
 * ## El formato, y por qué lleva el nombre dentro
 *
 *     @[Juan Pérez](user:2222…)        una mención a una persona
 *     /[Sprint 1](board:88ab…)         una referencia a algo del proyecto
 *
 * ⚠️ **El nombre va escrito en el mensaje a propósito.** Si la referencia fuese
 * solo un id, el día que saquen a Juan del equipo o borren el tablero habría que
 * elegir entre dejar un hueco, pintar un UUID o consultar algo que ya no existe.
 * Con el nombre dentro, degradar es **no hacer nada**: se pinta el texto tal
 * cual, sin una sola consulta.
 *
 * Es también lo que hace que un mensaje viejo siga leyéndose como se escribió.
 * Si alguien renombra el tablero, la frase de hace tres meses sigue diciendo lo
 * que decía entonces — que es lo correcto en una conversación: es un registro de
 * lo que se dijo, no una vista de datos actuales.
 */

/** Qué tipos de cosa se pueden referenciar. */
export const CHAT_REF_KINDS = ['user', 'project', 'workspace', 'board', 'task'] as const;
export type ChatRefKind = (typeof CHAT_REF_KINDS)[number];

/**
 * El patrón. **Espejo exacto** de `PATRON_REFERENCIA` en
 * `commons/api/chat-refs.ts` del frontend.
 *
 * - El nombre no puede llevar `]` ni saltos de línea: eso lo hace imposible de
 *   cerrar mal, y evita que un nombre con corchetes rompa el análisis del resto
 *   del mensaje.
 * - Se topa a 120 caracteres para que un nombre absurdo no convierta el mensaje
 *   entero en una sola etiqueta.
 * - El id es un UUID con su forma exacta, no `.*`: así una cadena cualquiera
 *   entre paréntesis no pasa por referencia.
 */
export const CHAT_REF_PATTERN =
  /([@/])\[([^\]\n]{1,120})\]\((user|project|workspace|board|task):([0-9a-fA-F-]{36})\)/g;

export interface ChatRef {
  /** `@` para personas, `/` para lo demás. */
  sigil: '@' | '/';
  kind: ChatRefKind;
  id: string;
  /** El nombre tal y como se escribió. Es lo que se pinta si el id ya no vale. */
  label: string;
}

/**
 * Saca todas las referencias de un texto.
 *
 * ⚠️ Se crea una expresión nueva en cada llamada en vez de reutilizar la
 * constante: las expresiones con bandera `g` **guardan `lastIndex` entre usos**,
 * así que compartir una sola instancia hace que la segunda llamada empiece por
 * la mitad y se salte referencias. Es un fallo que solo aparece a partir del
 * segundo mensaje.
 */
export function extraerReferencias(texto: string): ChatRef[] {
  const patron = new RegExp(CHAT_REF_PATTERN.source, 'g');
  const encontradas: ChatRef[] = [];

  let coincidencia = patron.exec(texto);
  while (coincidencia !== null) {
    encontradas.push({
      sigil: coincidencia[1] as '@' | '/',
      label: coincidencia[2] as string,
      kind: coincidencia[3] as ChatRefKind,
      id: (coincidencia[4] as string).toLowerCase(),
    });
    coincidencia = patron.exec(texto);
  }

  return encontradas;
}

/** Construye una etiqueta para meterla en el texto. */
export function componerReferencia(kind: ChatRefKind, id: string, label: string): string {
  const sigil = kind === 'user' ? '@' : '/';
  /* Los corchetes y saltos del nombre se limpian: son lo único que podría
     cerrar la etiqueta antes de tiempo. */
  const limpio = label
    .replace(/[[\]\n]/g, ' ')
    .trim()
    .slice(0, 120);
  return `${sigil}[${limpio}](${kind}:${id})`;
}
