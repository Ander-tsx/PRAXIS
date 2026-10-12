import type { Articulo, Bloque } from '@/content/ayuda/tipos';
import { Lightbulb, TriangleAlert } from 'lucide-react';
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
              className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-text-primary"
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
              className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
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
  const Icono = consejo ? Lightbulb : TriangleAlert;
  return (
    <aside
      className={`flex gap-3 rounded-xl border border-border border-l-[3px] bg-surface-2 p-4 ${
        consejo ? 'border-l-primary' : 'border-l-warning'
      }`}
    >
      <Icono
        className={`mt-0.5 h-4 w-4 shrink-0 ${consejo ? 'text-primary' : 'text-warning'}`}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span
          className={`font-sans text-[12px] font-bold uppercase tracking-wider ${
            consejo ? 'text-primary' : 'text-warning'
          }`}
        >
          {consejo ? 'Consejo' : 'Ten en cuenta'}
        </span>
        <div className="font-sans text-[14px] leading-relaxed text-text-primary">{children}</div>
      </div>
    </aside>
  );
}

function BloqueDeAyuda({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case 'h2':
      return (
        <h2
          id={idDeEncabezado(bloque.texto)}
          className="mt-4 scroll-mt-24 border-t border-border pt-7 font-sans text-[21px] font-semibold tracking-tight text-text-primary"
        >
          {bloque.texto}
        </h2>
      );
    case 'p':
      return (
        <p className="font-sans text-[15px] leading-7 text-text-primary">
          <Texto texto={bloque.texto} />
        </p>
      );
    case 'lista':
      return (
        <ul className="flex flex-col gap-2.5">
          {bloque.items.map((item) => (
            <li key={item} className="flex gap-3 font-sans text-[15px] leading-7 text-text-primary">
              <span
                aria-hidden="true"
                className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary"
              />
              <span className="min-w-0">
                <Texto texto={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case 'pasos':
      return (
        <ol className="flex flex-col gap-3.5">
          {bloque.items.map((item, i) => (
            <li
              key={item}
              className="flex gap-3.5 font-sans text-[15px] leading-7 text-text-primary"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-sans text-[13px] font-semibold text-text-primary">
                {i + 1}
              </span>
              <span className="min-w-0">
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
            <thead className="bg-surface-2">
              <tr>
                {bloque.cabecera.map((c, i) => (
                  <th
                    key={`${i}-${c}`}
                    className="px-4 py-3 font-sans text-[12px] font-semibold uppercase tracking-wider text-text-secondary"
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
                      className={`px-4 py-3 align-top leading-relaxed ${
                        i === 0 ? 'font-semibold text-text-primary' : 'text-text-primary'
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
      <header className="flex flex-col gap-3 pb-2">
        <span className="w-fit rounded-full bg-surface-2 px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          {articulo.categoria}
        </span>
        <h1 className="font-sans text-[32px] font-bold leading-tight tracking-tight text-text-primary">
          {articulo.titulo}
        </h1>
        <p className="max-w-2xl font-sans text-[16px] leading-relaxed text-text-secondary">
          {articulo.resumen}
        </p>
        {articulo.irA && (
          <Link
            href={articulo.irA.href}
            className="mt-1 inline-flex w-fit items-center rounded-full bg-primary px-4 py-2 font-sans text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {articulo.irA.etiqueta}
          </Link>
        )}
      </header>

      {articulo.bloques.map((bloque, i) => (
        <BloqueDeAyuda key={`${i}-${bloque.tipo}`} bloque={bloque} />
      ))}
    </article>
  );
}
