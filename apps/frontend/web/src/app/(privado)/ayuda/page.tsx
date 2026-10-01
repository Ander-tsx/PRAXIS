import { ARTICULOS, CATEGORIAS, articulosDe } from '@/content/ayuda/articulos';
import { AyudaShell } from '@/components/organisms/Ayuda/AyudaShell';
import { AppHeader } from '@praxis/commons';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Ayuda',
};

/**
 * La portada de la ayuda: qué es esto y por dónde empezar.
 *
 * El contenido de cada artículo vive en `content/ayuda/articulos.ts`; aquí solo
 * se compone el índice por categorías.
 */
export default function AyudaPage() {
  const primero = ARTICULOS[0];

  return (
    <AppHeader title="Ayuda">
      <AyudaShell>
        <div className="flex flex-col gap-10">
          <header className="flex flex-col gap-3">
            <h1 className="font-display text-4xl text-text-primary">Cómo funciona Praxis</h1>
            <p className="max-w-2xl font-sans text-[16px] leading-relaxed text-text-secondary">
              Una guía de todo lo que hace Praxis, desde crear tu primer proyecto hasta automatizar
              el trabajo repetitivo. Busca por palabra en el índice o recórrela por temas.
            </p>
            {primero && (
              <Link
                href={`/ayuda/${primero.slug}`}
                className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-5 py-2 font-sans text-[13px] font-semibold text-black transition-colors hover:bg-white/90"
              >
                Empezar por el principio
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </header>

          {CATEGORIAS.map((categoria) => (
            <section key={categoria.nombre} className="flex flex-col gap-3">
              <div>
                <h2 className="font-display text-2xl text-text-primary">{categoria.nombre}</h2>
                <p className="font-sans text-[14px] text-text-secondary">
                  {categoria.descripcion}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {articulosDe(categoria.nombre).map((articulo) => (
                  <Link
                    key={articulo.slug}
                    href={`/ayuda/${articulo.slug}`}
                    className="group flex flex-col gap-1 rounded-xl border border-border bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="font-sans text-[15px] font-semibold text-text-primary">
                      {articulo.titulo}
                    </span>
                    <span className="font-sans text-[13px] leading-snug text-text-secondary">
                      {articulo.resumen}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </AyudaShell>
    </AppHeader>
  );
}
