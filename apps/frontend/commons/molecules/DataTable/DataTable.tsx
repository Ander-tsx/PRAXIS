import type { CSSProperties, ReactNode } from 'react';

/**
 * El ancho de una columna.
 *
 * ## 🔴 Por qué es un objeto y no una cadena, que sería más cómodo
 *
 * Porque una cadena admitiría `auto`, y `auto` es **exactamente el fallo que
 * esta tabla existe para hacer imposible**. Ver la explicación entera en
 * {@link DataTable}: una pista `auto` se mide con su contenido, la cabecera y
 * las filas tienen contenidos distintos, y el desajuste se reparte hacia atrás
 * hasta que ninguna columna cae debajo de su título.
 *
 * Con este tipo no hay forma de escribir `auto` sin cambiar el tipo, que es
 * justo el momento en que alguien se pregunta por qué no se puede.
 */
export type Track =
  /** Reparto proporcional del espacio sobrante. */
  | { fr: number }
  /** Ancho fijo. Para columnas de contenido acotado: un menú, una insignia. */
  | { rem: number };

/**
 * ⚠️ **`minmax(0, Nfr)` y no `Nfr` a secas**, y la diferencia importa.
 *
 * Una pista `1fr` es en realidad `minmax(auto, 1fr)`: su mínimo es el contenido,
 * así que una celda con un texto largo sin espacios —un correo, un UUID— **empuja
 * la pista por encima de su reparto**. Como la cabecera lleva un rótulo corto y
 * la fila no, las dos rejillas vuelven a resolverse distinto y reaparece el mismo
 * desalineado por otra puerta.
 *
 * Con el mínimo en 0, el reparto manda siempre y el contenido que no cabe se
 * trunca —que para eso las celdas llevan `truncate`—.
 */
function toTrack(track: Track): string {
  return 'fr' in track ? `minmax(0, ${track.fr}fr)` : `${track.rem}rem`;
}

export interface DataColumn<T> {
  key: string;
  /** El rótulo de la cabecera. En escritorio; en móvil ver `mobileLabel`. */
  header: string;
  track: Track;
  /** Alinea a la derecha. Para la columna de acciones. */
  align?: 'end';
  /**
   * Lo que precede al valor en la vista de tarjeta.
   *
   * `undefined` reutiliza `header`. `false` no pone ninguna, que es lo que
   * necesita la celda principal de la tarjeta —el nombre y su avatar—, donde una
   * etiqueta «Cuenta» delante sobra.
   */
  mobileLabel?: string | false;
  cell: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /**
   * Alineación vertical de las celdas en escritorio.
   *
   * `center` para filas de una línea; `start` cuando alguna celda crece —el
   * motivo de una acción en el registro— y alinear al centro deja las demás
   * flotando a media altura.
   */
  align?: 'center' | 'start';
  ariaLabel: string;
}

/**
 * La tabla del panel de administración.
 *
 * ## 🔴 El fallo que viene a cerrar
 *
 * Las tres tablas se dibujaban con **dos rejillas CSS independientes**: un `div`
 * de cabecera y un `li` por fila, cada uno con su propio `display: grid` y su
 * copia —a mano— de la misma plantilla de columnas.
 *
 * Dos rejillas separadas solo caen alineadas si **todas** sus pistas se resuelven
 * igual, y eso deja de cumplirse en cuanto una depende del contenido:
 *
 * | Tabla | Plantilla | Qué pasaba |
 * |---|---|---|
 * | `UsersTable` | `…_1fr_auto` | La pista `auto` medía «Acciones» en la cabecera y **tres botones** en la fila |
 * | `ProjectsTable` | `…_auto_1fr_auto` | Lo mismo, y **por partida doble**: «Tamaño» y «Acciones» |
 * | `ActivityTable` | `1fr_1.2fr_1.2fr_2fr` | Sin `auto`, pero un `1fr` es `minmax(auto,1fr)`: un correo largo empujaba la pista solo en la fila |
 *
 * Y el desajuste no se queda en su columna: al medir de más una pista, las
 * demás se recolocan, así que **ninguna** acaba debajo de su título. Se ve como
 * «la tabla está movida» y no hay nada roto que buscar, porque cada mitad es
 * correcta por su cuenta.
 *
 * ## Cómo se cierra, y no solo se arregla
 *
 * 1. **Una sola plantilla**, calculada aquí y publicada como variable CSS en el
 *    contenedor. La cabecera y las filas la heredan; no hay dos copias que
 *    puedan divergir.
 * 2. **`auto` no se puede escribir.** {@link Track} solo admite `fr` o `rem`.
 * 3. **Los `fr` son `minmax(0, …)`**, así que el contenido no empuja.
 *
 * ⚠️ La variable va en un `style` inline y las clases en Tailwind
 * (`md:grid-cols-[var(--praxis-tabla-cols)]`) porque **un estilo inline no puede
 * llevar media query**: la rejilla solo existe a partir de `md`, y por debajo las
 * filas son tarjetas. Poner la plantilla directamente en el `style` la aplicaría
 * también en el móvil, donde no hay columnas.
 *
 * ## Sin `overflow-hidden`, a propósito
 *
 * El contenedor lo llevaba para redondear las esquinas, y eso **recorta
 * cualquier desplegable** que salga de una fila —el menú de acciones de la
 * última fila quedaba cortado por el borde—. Las esquinas se redondean ahora en
 * la cabecera y en la última fila, que es lo que hacía falta de verdad.
 *
 * ## No lleva `<table>`
 *
 * Se valoró. Un `<table>` da la semántica gratis, pero estas tablas **dejan de
 * ser tablas en móvil**: las columnas se apilan en tarjetas, porque seis
 * columnas con scroll horizontal en un teléfono no se leen — y este panel es
 * justo el que se abre desde el teléfono cuando alguien avisa de un problema.
 * Cambiar `display` sobre un `<table>` destruye su árbol de accesibilidad, que
 * es lo único que se ganaba. Con lista y rejilla, `ariaLabel` y las etiquetas de
 * cada celda en móvil hacen el trabajo sin prometer una semántica que se rompe a
 * los 768 px.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  align = 'center',
  ariaLabel,
}: DataTableProps<T>) {
  /* Una vez, aquí. Es la única definición de las columnas que existe. */
  const plantilla = columns.map((columna) => toTrack(columna.track)).join(' ');

  const alineacion = align === 'center' ? 'md:items-center' : 'md:items-start';

  return (
    <div
      className="rounded-2xl border border-border"
      style={{ '--praxis-tabla-cols': plantilla } as CSSProperties}
    >
      {/* Cabecera: solo en escritorio, donde de verdad hay columnas. */}
      <div className="hidden rounded-t-2xl border-b border-border bg-surface px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-white md:grid md:grid-cols-[var(--praxis-tabla-cols)] md:gap-4">
        {columns.map((columna) => (
          <span key={columna.key} className={columna.align === 'end' ? 'text-right' : undefined}>
            {columna.header}
          </span>
        ))}
      </div>

      <ul aria-label={ariaLabel}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={`flex flex-col gap-3 border-b border-border px-4 py-4 transition-colors last:rounded-b-2xl last:border-b-0 hover:bg-surface-elevated md:grid md:grid-cols-[var(--praxis-tabla-cols)] md:gap-4 ${alineacion}`}
          >
            {columns.map((columna) => {
              const conEtiqueta = columna.mobileLabel !== false;

              return (
                <div
                  key={columna.key}
                  /* En móvil, etiqueta y valor van en una fila; en escritorio la
                     celda vuelve a ser un bloque y la etiqueta desaparece. Sin
                     el `flex`, una celda cuyo contenido es un `<p>` dejaba la
                     etiqueta sola en su propia línea. */
                  className={[
                    'min-w-0',
                    conEtiqueta ? 'flex items-baseline gap-2' : '',
                    columna.align === 'end' ? 'md:flex md:justify-end' : 'md:block',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* La etiqueta solo en móvil: en escritorio ya está arriba, en
                      la cabecera, y repetirla en cada celda es la fila entera
                      escrita dos veces. */}
                  {conEtiqueta && (
                    <span className="shrink-0 font-sans text-xs text-white md:hidden">
                      {columna.mobileLabel ?? columna.header}
                    </span>
                  )}
                  <div className="min-w-0">{columna.cell(row)}</div>
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
