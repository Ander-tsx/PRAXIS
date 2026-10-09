import { ArticuloDeAyuda, idDeEncabezado } from '@/components/organisms/Ayuda/ArticuloDeAyuda';
import type { Articulo } from '@/content/ayuda/tipos';
import { DOCUMENTOS_LEGALES } from '@/content/legal';
import Link from 'next/link';

/**
 * Un texto legal con su índice de secciones y el enlace al otro documento.
 *
 * Lo comparten la versión pública (`/terminos`, `/privacidad`) y la de dentro de
 * la aplicación (`/main/legal/<slug>`): **un solo texto, dos marcos**. Dos copias
 * del mismo contrato acaban diciendo cosas distintas.
 */
export function PaginaLegal({
  documento,
  hrefDe,
}: {
  documento: Articulo;
  /** A dónde lleva cada documento en este marco. */
  hrefDe: (slug: string) => string;
}) {
  const secciones = documento.bloques.flatMap((b) => (b.tipo === 'h2' ? [b.texto] : []));

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <nav aria-label="Documentos legales" className="mb-6 flex flex-wrap gap-2">
          {DOCUMENTOS_LEGALES.map((d) => (
            <Link
              key={d.slug}
              href={hrefDe(d.slug)}
              aria-current={d.slug === documento.slug ? 'page' : undefined}
              className={`rounded-full px-3 py-1 font-sans text-[12px] font-semibold transition-colors ${
                d.slug === documento.slug
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              {d.titulo}
            </Link>
          ))}
        </nav>
        <nav aria-label="Secciones" className="hidden flex-col gap-1.5 lg:flex">
          {secciones.map((titulo) => (
            <a
              key={titulo}
              href={`#${idDeEncabezado(titulo)}`}
              className="font-sans text-[13px] leading-snug text-text-secondary transition-colors hover:text-text-primary"
            >
              {titulo}
            </a>
          ))}
        </nav>
      </aside>

      <ArticuloDeAyuda articulo={documento} />
    </div>
  );
}
