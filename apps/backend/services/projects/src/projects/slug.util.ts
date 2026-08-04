/**
 * El identificador legible que sale en la URL de un proyecto.
 *
 * ## Por qué existe
 *
 * `/projects/a7382229-7142-409f-8257-cb2304626152` no dice nada. El nombre sí,
 * pero el nombre solo es único **por dueño** (`@@unique([ownerId, name])`), y
 * quien resuelve la URL es una persona que puede ver proyectos de varios
 * dueños: dos «Sprint 1» de equipos distintos en los que está metida. Por eso
 * el slug se hace único **global** y se desambigua con un sufijo.
 *
 * ⚠️ Que el slug sea único global **no reintroduce** el problema que arregló la
 * migración `20260730020000`. Aquello era malo porque el usuario escribía un
 * nombre y recibía un conflicto sobre una fila que no podía ver, sin forma de
 * entenderlo. Aquí nadie escribe el slug: se deriva, y el choque se resuelve
 * solo. El único rastro es un `-2` que insinúa que alguien más usó ese nombre.
 */

/** Longitud máxima de la parte de texto. Suficiente para leerlo, corto para una URL. */
const MAX_LARGO = 60;

/**
 * «Rediseño del panel» → «rediseno-del-panel».
 *
 * ⚠️ La normalización Unicode **no es opcional en este producto**: los nombres
 * van en español y `normalize('NFD')` es lo que separa la tilde de la letra
 * para poder quitarla. Sin esto, «Rediseño» produce un slug con `ñ` dentro, que
 * el navegador percent-encodea (`%C3%B1`) y deja una URL peor que el UUID.
 */
export function slugificar(texto: string): string {
  const base = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas diacríticas sueltas tras el NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // todo lo que no sea alfanumérico, a guion
    .replace(/^-+|-+$/g, '') // sin guiones colgando
    .slice(0, MAX_LARGO)
    .replace(/-+$/g, ''); // el corte pudo dejar uno al final

  /**
   * Un nombre que se queda sin nada utilizable —«...», «🎉», solo signos—
   * necesita algo. `proyecto` colisionará con otros iguales y el sufijo los
   * separará, que es exactamente para lo que está.
   */
  return base || 'proyecto';
}

/**
 * ¿Esta cadena es un UUID?
 *
 * Es lo que distingue una URL vieja de una nueva. Se acepta cualquier versión:
 * lo que importa es la forma, no qué generador la produjo.
 */
export function esUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}

/**
 * Busca un slug libre a partir de un nombre.
 *
 * El primero se queda el slug limpio; los siguientes reciben `-2`, `-3`… El
 * sufijo **solo aparece cuando hace falta**, así que la mayoría de proyectos
 * tienen una URL sin ruido.
 *
 * `existe` se inyecta en vez de recibir el cliente de Prisma para poder
 * probarlo sin base de datos, y para que sirva igual dentro de una transacción
 * —donde el cliente es el `tx`, no `this.prisma`— que fuera de ella.
 *
 * ⚠️ Esto **no** garantiza por sí solo que no haya duplicados: entre la
 * comprobación y el `INSERT` cabe otra petición. Quien manda es el índice único
 * de la columna; esto solo evita el reintento en el caso normal. El que llama
 * tiene que capturar el P2002 igualmente.
 */
export async function generarSlugUnico(
  nombre: string,
  existe: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugificar(nombre);

  if (!(await existe(base))) return base;

  /* Se empieza en 2 porque el que no lleva sufijo es, conceptualmente, el 1.
     El tope evita un bucle infinito si `existe` devolviera siempre true por un
     error; a partir de ahí se cae a un sufijo aleatorio, que siempre termina. */
  for (let n = 2; n <= 100; n++) {
    const candidato = `${base}-${n}`;
    if (!(await existe(candidato))) return candidato;
  }

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
