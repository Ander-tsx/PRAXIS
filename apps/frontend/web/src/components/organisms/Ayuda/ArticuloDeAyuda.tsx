import type { Articulo, Bloque } from '@/content/ayuda/tipos';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Un id estable para el ancla de cada encabezado. */
export function idDeEncabezado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Texto con tres marcas: `**negrita**`, `` `código` `` y `[texto](/ruta)`.
 *
 * No es un procesador de Markdown a propósito: los artículos son datos y con
 * estas tres marcas se dice todo lo que la ayuda necesita decir.
 */
function Texto({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);

  return (
    <>
      {partes.map((parte, i) => {
        const clave = `${i}-${parte.slice(0, 12)}`;
        if (parte.startsWith('**')) {
          return (
            <strong key={clave} className="font-semibold text-text-primary">
              {parte.slice(2, -2)}
            </strong>
          );
        }
        if (parte.startsWith('`')) {
          return (
            <code
              key={clave}
              className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-text-primary"
            >
              {parte.slice(1, -1)}
            </code>
          );
        }
        const enlace = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (enlace) {
          return (
            <Link
              key={clave}
              href={enlace[2]}
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              {enlace[1]}
            </Link>
          );
        }
        return <span key={clave}>{parte}</span>;
      })}
    </>
  );
}

function Nota({
  tono,
  children,
}: {
  tono: 'consejo' | 'aviso';
  children: ReactNode;
}) {
  const consejo = tono === 'consejo';
  return (
    <aside
      className={`rounded-xl border px-4 py-3 font-sans text-[14px] leading-relaxed ${
        consejo
          ? 'border-primary/30 bg-primary/10 text-white'
          : 'border-amber-400/30 bg-amber-400/10 text-white'
      }`}
    >
      <span
        className={`mb-1 block font-sans text-[11px] font-semibold uppercase tracking-wider ${
          consejo ? 'text-primary' : 'text-amber-300'
        }`}
      >
        {consejo ? 'Consejo' : 'Ten en cuenta'}
      </span>
      {children}
    </aside>
  );
}

function BloqueDeAyuda({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case 'h2':
      return (
        <h2
          id={idDeEncabezado(bloque.texto)}
          className="mt-4 scroll-mt-24 font-display text-2xl text-text-primary"
        >
          {bloque.texto}
        </h2>
      );
    case 'p':
      return (
        <p className="font-sans text-[15px] leading-relaxed text-white">
          <Texto texto={bloque.texto} />
        </p>
      );
    case 'lista':
      return (
        <ul className="flex list-disc flex-col gap-2 pl-5 font-sans text-[15px] leading-relaxed text-white marker:text-text-secondary">
          {bloque.items.map((item) => (
            <li key={item}>
              <Texto texto={item} />
            </li>
          ))}
        </ul>
      );
    case 'pasos':
      return (
        <ol className="flex flex-col gap-3">
          {bloque.items.map((item, i) => (
            <li key={item} className="flex gap-3 font-sans text-[15px] leading-relaxed text-white">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 font-sans text-[12px] font-semibold text-text-primary">
                {i + 1}
              </span>
              <span>
                <Texto texto={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'consejo':
    case 'aviso':
      return (
        <Nota tono={bloque.tipo}>
          <Texto texto={bloque.texto} />
        </Nota>
      );
    case 'tabla':
      return (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[420px] border-collapse text-left font-sans text-[14px]">
            <thead className="bg-white/5">
              <tr>
                {bloque.cabecera.map((c, i) => (
                  <th
                    key={`${i}-${c}`}
                    className="px-4 py-2.5 font-sans text-[12px] font-semibold uppercase tracking-wider text-text-secondary"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloque.filas.map((fila) => (
                <tr key={fila.join('|')} className="border-t border-border">
                  {fila.map((celda, i) => (
                    <td
                      key={`${i}-${celda}`}
                      className={`px-4 py-2.5 align-top leading-relaxed ${
                        i === 0 ? 'font-medium text-text-primary' : 'text-white'
                      }`}
                    >
                      <Texto texto={celda} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Un artículo entero: cabecera, bloques y, si lo hay, el enlace a donde se hace. */
export function ArticuloDeAyuda({ articulo }: { articulo: Articulo }) {
  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <span className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
          {articulo.categoria}
        </span>
        <h1 className="font-display text-4xl text-text-primary">{articulo.titulo}</h1>
        <p className="font-sans text-[16px] text-text-secondary">{articulo.resumen}</p>
        {articulo.irA && (
          <Link
            href={articulo.irA.href}
            className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 font-sans text-[13px] font-semibold text-white transition-colors hover:bg-white/15"
          >
            {articulo.irA.etiqueta}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </header>

      {articulo.bloques.map((bloque, i) => (
        <BloqueDeAyuda key={`${i}-${bloque.tipo}`} bloque={bloque} />
      ))}
    </article>
  );
}
