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
  /* El lenguaje de la valla abierta. Importa solo para `praxis-grafica`. */
  let lenguaje = '';
  let tabla: string[] | null = null;

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

  function cerrarTabla() {
    if (!tabla) return;
    const pintada = tablaDesdeLineas(tabla, `t${salida.length}`);
    /* Lo que no llegó a ser una tabla vuelve a ser prosa, sin perder ni una
       línea: el modelo empieza tablas que no termina más veces de las que
       parece, y tragárselas sería peor que enseñarlas mal. */
    if (pintada) salida.push(pintada);
    else for (const linea of tabla) parrafo.push(linea);
    tabla = null;
    if (!pintada) cerrarParrafo();
  }

  function cerrarTodo() {
    cerrarTabla();
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
        lenguaje = linea.trimStart().slice(3).trim().toLowerCase();
      } else {
        salida.push(bloqueCerrado(codigo, lenguaje, salida.length));
        codigo = null;
        lenguaje = '';
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
     * Una fila de tabla.
     *
     * Va **antes** que la regla horizontal y que la lista, y el orden importa:
     * la línea separadora de una tabla (`|---|---|`) empieza por `|` pero lleva
     * guiones dentro, y la regla horizontal la reclamaría.
     *
     * Se acumulan las líneas y se deciden al cerrar: una tabla necesita al
     * menos cabecera y separador, y eso no se sabe mirando una sola línea.
     */
    if (linea.trim().startsWith('|')) {
      cerrarParrafo();
      cerrarLista();
      if (!tabla) tabla = [];
      tabla.push(linea.trim());
      continue;
    }
    cerrarTabla();

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

    /* El texto del ítem, sin la viñeta. Se saca aquí y no dentro del `if` para
       no tener que afirmar con un `!` que una de las dos coincidencias existe:
       el compilador ya lo sabe si se estrecha sobre esta constante. */
    const item = vineta?.[1] ?? numerada?.[1];
    if (item !== undefined) {
      cerrarParrafo();
      const ordenada = Boolean(numerada);
      /* Cambiar de tipo de lista cierra la anterior: `- uno` seguido de `1. dos`
         son dos listas, no una con dos formas de viñeta. */
      if (lista && lista.ordenada !== ordenada) cerrarLista();
      if (!lista) lista = { ordenada, items: [] };
      lista.items.push(item);
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
    salida.push(bloqueCerrado(codigo, lenguaje, salida.length));
  }
  cerrarTodo();

  return salida;
}

/* ─── Bloques cerrados: código y gráficas ─────────────────────────────────── */

/**
 * Una valla cerrada, pintada según su lenguaje.
 *
 * `praxis-grafica` es el único que no sale como código: lleva dentro el JSON de
 * una gráfica y se dibuja. Cualquier otro —o un JSON que no se entiende— cae al
 * bloque de código de siempre, que es la única salida que **nunca pierde el
 * contenido**.
 */
function bloqueCerrado(lineas: string[], lenguaje: string, indice: number): ReactNode {
  if (lenguaje === 'praxis-grafica') {
    const grafica = leerGrafica(lineas.join('\n'));
    if (grafica) return <Grafica key={`g${indice}`} {...grafica} />;
  }
  return (
    <pre
      key={`c${indice}`}
      className="scrollbar-slim overflow-x-auto rounded-lg bg-surface-elevated px-3 py-2 font-mono text-xs leading-relaxed text-text-primary"
    >
      <code>{lineas.join('\n')}</code>
    </pre>
  );
}

/* ─── Tablas ──────────────────────────────────────────────────────────────── */

/**
 * Una tabla de tuberías, si las líneas acumuladas llegan a serlo.
 *
 * Devuelve `null` cuando no lo son —falta el separador, o solo hay cabecera— y
 * entonces quien llama las devuelve a la prosa. Media tabla pintada como tabla
 * se lee peor que las líneas tal cual.
 *
 * ⚠️ **Sigue sin haber ningún `dangerouslySetInnerHTML`.** Cada celda pasa por
 * {@link enTrozos}, que devuelve texto de React: escapado por definición. Es la
 * misma razón por la que este archivo no monta una librería de markdown, y
 * añadir tablas no la cambia.
 */
function tablaDesdeLineas(lineas: string[], clave: string): ReactNode | null {
  if (lineas.length < 3) return null;
  const separador = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
  if (!separador.test(lineas[1] ?? '')) return null;

  const celdas = (linea: string) =>
    linea
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((celda) => celda.trim());

  const cabecera = celdas(lineas[0] ?? '');
  const filas = lineas.slice(2).map(celdas);
  if (cabecera.length === 0) return null;

  return (
    /* La tabla desborda dentro de su propio contenedor y nunca empuja la
       burbuja: en una conversación estrecha, cuatro columnas de cifras no caben
       y ensanchar el hilo rompe la lectura de todo lo demás. */
    <div key={clave} className="scrollbar-slim -mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse font-sans text-xs">
        <thead>
          <tr>
            {cabecera.map((celda, columna) => (
              <th
                // biome-ignore lint/suspicious/noArrayIndexKey: la posición ES la identidad de una columna
                key={columna}
                className="border-b border-border px-2 py-1.5 text-left font-semibold whitespace-nowrap text-text-primary"
              >
                {enTrozos(celda)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, indice) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: la posición ES la identidad de una fila
            <tr key={indice}>
              {cabecera.map((_, columna) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: la posición ES la identidad de una celda
                <td
                  key={columna}
                  className="border-b border-border px-2 py-1.5 align-top text-text-secondary"
                >
                  {enTrozos(fila[columna] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Gráficas ────────────────────────────────────────────────────────────── */

interface DatoDeGrafica {
  etiqueta: string;
  valor: number;
}

interface GraficaLeida {
  titulo: string | null;
  datos: DatoDeGrafica[];
}

/**
 * El JSON de una gráfica, o `null` si no se entiende.
 *
 * ⚠️ **Nada de confiar en la forma.** Esto lo escribe un modelo, así que cada
 * campo se comprueba: un `valor` que llega como texto, una lista vacía o un
 * objeto con otras claves tienen que caer al bloque de código, no reventar la
 * burbuja entera. Una respuesta con una gráfica mal formada sigue siendo una
 * respuesta.
 */
function leerGrafica(crudo: string): GraficaLeida | null {
  let json: unknown;
  try {
    json = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;
  const objeto = json as { titulo?: unknown; datos?: unknown };
  if (!Array.isArray(objeto.datos)) return null;

  const datos: DatoDeGrafica[] = [];
  for (const bruto of objeto.datos) {
    if (!bruto || typeof bruto !== 'object') return null;
    const { etiqueta, valor } = bruto as { etiqueta?: unknown; valor?: unknown };
    if (typeof etiqueta !== 'string' || typeof valor !== 'number' || !Number.isFinite(valor)) {
      return null;
    }
    datos.push({ etiqueta, valor });
  }
  /* Un tope, porque el modelo no lo tiene: veinte barras ya no se leen, y
     doscientas convierten la burbuja en una pared. */
  if (datos.length === 0 || datos.length > 20) return null;

  return { titulo: typeof objeto.titulo === 'string' ? objeto.titulo : null, datos };
}

/**
 * Barras horizontales, en HTML y sin una sola dependencia.
 *
 * ## ⚠️ Por qué horizontales y por qué no hay librería
 *
 * Horizontales porque la etiqueta cabe: en una burbuja de chat, un gráfico de
 * barras verticales acaba con los nombres girados o recortados, y un nombre
 * recortado es un dato perdido. Y sin librería por lo mismo que no hay motor de
 * markdown en este archivo — una barra es un `div` con un ancho, y a cambio no
 * se arrastra un paquete entero al navegador ni se abre la pregunta de qué se
 * sanea de un contenido que escribe una IA.
 *
 * Los valores van **escritos al lado**, no solo dibujados: una barra sin cifra
 * se puede comparar pero no se puede citar, y quien lee un informe cita.
 */
function Grafica({ titulo, datos }: GraficaLeida) {
  /* Contra el mayor y no contra la suma: esto compara magnitudes, no reparte un
     total. Con `Math.abs` porque un valor negativo tiene tamaño igual. */
  const tope = Math.max(...datos.map((dato) => Math.abs(dato.valor)), 1);

  return (
    <figure className="flex flex-col gap-2 rounded-lg bg-surface-elevated px-3 py-2.5">
      {titulo && (
        <figcaption className="font-sans text-xs font-semibold text-text-primary">
          {titulo}
        </figcaption>
      )}
      <div className="flex flex-col gap-1.5">
        {datos.map((dato, indice) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: la posición ES la identidad de una barra
          <div key={indice} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate font-sans text-[11px] text-text-secondary">
              {dato.etiqueta}
            </span>
            {/* `min-w-0` para que la barra pueda encogerse: sin él, el `flex-1`
                no baja del ancho de su contenido y la fila desborda. */}
            <div className="h-2 min-w-0 flex-1 rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max((Math.abs(dato.valor) / tope) * 100, 2)}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-sans text-[11px] tabular-nums text-text-primary">
              {dato.valor}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
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
