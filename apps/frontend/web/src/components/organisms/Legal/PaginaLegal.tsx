import { ArticuloDeAyuda, idDeEncabezado } from '@/components/organisms/Ayuda/ArticuloDeAyuda';
import { AnclaDeRiel, EnlaceDeRiel, GrupoDeRiel } from '@/components/organisms/Documentos/riel';
import type { Articulo } from '@/content/ayuda/tipos';
import { DOCUMENTOS_LEGALES } from '@/content/legal';

/**
 * Un texto legal con su riel lateral: los documentos y las secciones de este.
 *
 * Lo comparten la versión pública (`/terminos`, `/privacidad`) y la de dentro de la aplicación
 * (`/main/legal/<slug>`): **un solo texto, dos marcos**. Dos copias del mismo contrato acaban
 * diciendo cosas distintas. Se ve igual que la Ayuda (mismo riel, mismo lector) a propósito.
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
    <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-2 scrollbar-none">
        <nav aria-label="Documentos legales" className="flex flex-col gap-6">
          <GrupoDeRiel titulo="Documentos legales">
            {DOCUMENTOS_LEGALES.map((d) => (
              <EnlaceDeRiel key={d.slug} href={hrefDe(d.slug)} activo={d.slug === documento.slug}>
                {d.titulo}
              </EnlaceDeRiel>
            ))}
          </GrupoDeRiel>
          <div className="hidden lg:block">
            <GrupoDeRiel titulo="En esta página">
              {secciones.map((titulo) => (
                <AnclaDeRiel key={titulo} href={`#${idDeEncabezado(titulo)}`}>
                  {titulo}
                </AnclaDeRiel>
              ))}
            </GrupoDeRiel>
          </div>
        </nav>
      </aside>

      <div className="min-w-0 max-w-3xl">
        <ArticuloDeAyuda articulo={documento} />
      </div>
    </div>
  );
}
