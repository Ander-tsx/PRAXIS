import { Fragment, type ReactNode } from 'react';

/**
 * El texto del asistente, con su formato puesto.
 *
 * Gemini escribe markdown por su cuenta y sin que nadie se lo pida: `**así**`
 * para las cifras, `##` para separar apartados, `-` y `1.` para enumerar,
 * acentos graves para los identificadores. La burbuja lo pintaba **tal cual**, y
 * lo que se leía era la sintaxis: asteriscos sueltos, almohadillas al principio
 * de línea y guiones que no formaban ninguna lista.
 *
 * Se usa en los dos sitios donde el modelo escribe prosa —la burbuja y el
 * `porQue` de cada propuesta— y por eso vive aparte.
 *
 * ## ⚠️ Por qué sigue sin haber una librería de markdown
 *
 * Es la pregunta obvia, y la respuesta es la misma que la primera vez, solo que
 * ahora hay más superficie: un motor completo trae tablas, imágenes, enlaces y
 * **HTML en bruto**, y con ello la pregunta de qué se sanea sobre un texto que
 * lo escribe un modelo — que es, literalmente, el contenido del que uno no se
 * fía.
 *
 * Aquí no hay nada que sanear **por construcción**: se parte la cadena y cada
 * trozo se pinta como texto de React, que escapa por definición. No se
 * interpreta HTML en ningún punto y no hay un solo `dangerouslySetInnerHTML`.
 * El precio es no soportar tablas ni enlaces, y se paga a gusto: el modelo casi
 * no los usa, y un enlace que escribe una IA es justo lo que no quieres pintar
 * como pulsable.
 *
 * ## Cómo se lee esto
 *
 * En dos pasadas, como cualquier markdown:
 *
 * 1. **Bloques** ({@link enBloques}): separa párrafos, encabezados, listas y
 *    trozos de código por líneas.
 * 2. **Inline** ({@link enTrozos}): dentro de cada línea, negrita, cursiva y
 *    código.
 *
 * Y la regla que gobierna las dos: **lo que no se reconoce se deja como texto**.
 * Un asterisco suelto en mitad de una frase era literal antes y lo sigue siendo.
 */
export function ModelText({ texto }: { texto: string }) {
  return <>{enBloques(texto)}</>;
}

/* ─── Bloques ─────────────────────────────────────────────────────────────── */

/**
 * De texto plano a bloques.
 *
 * Se recorre línea a línea en vez de con una expresión regular sobre todo el
 * texto: las listas y los bloques de código son **estados** que abarcan varias
 * líneas, y eso con una regular acaba en un patrón que nadie puede leer.
 */
function enBloques(texto: string): ReactNode[] {
  const lineas = texto.split('\n');
  const salida: ReactNode[] = [];

  /* Lo que se está acumulando: un párrafo, una lista o un bloque de código. */
  let parrafo: string[] = [];
  let lista: { ordenada: boolean; items: string[] } | null = null;
  let codigo: string[] | null = null;

  function cerrarParrafo() {
    if (parrafo.length === 0) return;
    salida.push(
      <p key={`p${salida.length}`} className="whitespace-pre-wrap">
        {enTrozos(parrafo.join('\n'))}
      </p>,
    );
    parrafo = [];
  }

  function cerrarLista() {
    if (!lista) return;
    const { ordenada, items } = lista;
    const Etiqueta = ordenada ? 'ol' : 'ul';
    salida.push(
      <Etiqueta
        key={`l${salida.length}`}
        className={`flex flex-col gap-1 ${ordenada ? 'list-decimal' : 'list-disc'} pl-5`}
      >
        {items.map((item, indice) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: la posición ES la identidad de una línea de texto
          <li key={indice} className="pl-0.5">
            {enTrozos(item)}
          </li>
        ))}
      </Etiqueta>,
    );
    lista = null;
  }

  function cerrarTodo() {
    cerrarParrafo();
    cerrarLista();
  }

  for (const linea of lineas) {
    /* Un bloque de código se traga cualquier otra sintaxis hasta que cierra:
       dentro de él, un `#` o un `-` son código, no markdown. */
    if (linea.trimStart().startsWith('```')) {
      if (codigo === null) {
        cerrarTodo();
        codigo = [];
      } else {
        salida.push(
          <pre
            key={`c${salida.length}`}
            className="scrollbar-slim overflow-x-auto rounded-lg bg-surface-elevated px-3 py-2 font-mono text-xs leading-relaxed text-text-primary"
          >
            <code>{codigo.join('\n')}</code>
          </pre>,
        );
        codigo = null;
      }
      continue;
    }
    if (codigo !== null) {
      codigo.push(linea);
      continue;
    }

    /* Una línea en blanco cierra lo que hubiera abierto. */
    if (linea.trim() === '') {
      cerrarTodo();
      continue;
    }

    /**
     * Encabezados.
     *
     * ⚠️ Se pintan como texto destacado y **no** como `<h1>`–`<h3>`. Esto vive
     * dentro de una burbuja de conversación, y un encabezado de verdad ahí
     * rompe el esquema del documento para un lector de pantalla: la página ya
     * tiene su jerarquía y la respuesta del asistente no es una sección de ella.
     * Visualmente se lee igual; semánticamente no miente.
     */
    const encabezado = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (encabezado) {
      cerrarTodo();
      const nivel = encabezado[1].length;
      salida.push(
        <p
          key={`h${salida.length}`}
          className={`font-sans font-semibold text-text-primary ${
            nivel <= 2 ? 'text-[15px]' : 'text-sm'
          }`}
        >
          {enTrozos(encabezado[2])}
        </p>,
      );
      continue;
    }

    /**
     * Una regla horizontal (`---`).
     *
     * ⚠️ Va **antes** que la lista, y el orden importa: `---` empieza por guion
     * y espacio no, pero `- - -` sí casaría con la viñeta. Comprobar la regla
     * primero evita una lista de tres puntos vacíos.
     */
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(linea)) {
      cerrarTodo();
      salida.push(<hr key={`r${salida.length}`} className="border-border" />);
      continue;
    }

    const vineta = /^\s*[-*+]\s+(.*)$/.exec(linea);
    const numerada = /^\s*\d+[.)]\s+(.*)$/.exec(linea);

    if (vineta || numerada) {
      cerrarParrafo();
      const ordenada = Boolean(numerada);
      /* Cambiar de tipo de lista cierra la anterior: `- uno` seguido de `1. dos`
         son dos listas, no una con dos formas de viñeta. */
      if (lista && lista.ordenada !== ordenada) cerrarLista();
      if (!lista) lista = { ordenada, items: [] };
      lista.items.push((vineta ?? numerada)![1]);
      continue;
    }

    /* Cualquier otra cosa es prosa. Si veníamos de una lista, la cierra: una
       línea sin viñeta después de una lista es un párrafo nuevo. */
    cerrarLista();
    parrafo.push(linea);
  }

  /* Un bloque de código sin cerrar —el modelo se quedó a medias, o la respuesta
     se cortó por longitud— se pinta igual. Perder el contenido sería peor. */
  if (codigo !== null && codigo.length > 0) {
    salida.push(
      <pre
        key={`c${salida.length}`}
        className="scrollbar-slim overflow-x-auto rounded-lg bg-surface-elevated px-3 py-2 font-mono text-xs leading-relaxed text-text-primary"
      >
        <code>{codigo.join('\n')}</code>
      </pre>,
    );
  }
  cerrarTodo();

  return salida;
}

/* ─── Inline ──────────────────────────────────────────────────────────────── */

/**
 * Negrita, cursiva y código dentro de una línea.
 *
 * ## ⚠️ El orden de las alternativas no es negociable
 *
 * `\*\*` va **antes** que `\*`, y el código va el primero de todos. Al revés, la
 * cursiva se comería el primer asterisco de una negrita y `**64%**` saldría como
 * `*64%*` en cursiva — que es peor que no formatear nada, porque parece un
 * error del asistente y no del renderizador.
 *
 * El código va primero porque dentro de acentos graves **nada más cuenta**: un
 * `*` ahí es un asterisco, no el principio de una cursiva.
 */
const INLINE = /(`[^`\n]+`)|(\*\*[\s\S]+?\*\*)|(\*[^*\n]+\*)|(\b_[^_\n]+_\b)/g;

function enTrozos(texto: string): ReactNode[] {
  const salida: ReactNode[] = [];
  let ultimo = 0;
  let coincidencia: RegExpExecArray | null;

  /* `exec` en bucle y no `split`: hay cuatro grupos y `split` devolvería un
     array lleno de `undefined` por cada alternativa que no casó. */
  INLINE.lastIndex = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: es la forma canónica de recorrer con `exec`
  while ((coincidencia = INLINE.exec(texto)) !== null) {
    if (coincidencia.index > ultimo) {
      salida.push(
        <Fragment key={`t${ultimo}`}>{texto.slice(ultimo, coincidencia.index)}</Fragment>,
      );
    }

    const [entero, codigo, negrita, cursiva, subrayado] = coincidencia;
    const clave = `m${coincidencia.index}`;

    if (codigo) {
      salida.push(
        <code
          key={clave}
          className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[0.85em] text-text-primary"
        >
          {codigo.slice(1, -1)}
        </code>,
      );
    } else if (negrita) {
      salida.push(
        <strong key={clave} className="font-semibold text-text-primary">
          {negrita.slice(2, -2)}
        </strong>,
      );
    } else if (cursiva) {
      salida.push(
        <em key={clave} className="italic">
          {cursiva.slice(1, -1)}
        </em>,
      );
    } else if (subrayado) {
      salida.push(
        <em key={clave} className="italic">
          {subrayado.slice(1, -1)}
        </em>,
      );
    }

    ultimo = coincidencia.index + entero.length;
  }

  if (ultimo < texto.length) {
    salida.push(<Fragment key={`t${ultimo}`}>{texto.slice(ultimo)}</Fragment>);
  }

  return salida;
}
