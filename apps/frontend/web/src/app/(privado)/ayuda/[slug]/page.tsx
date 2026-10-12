import { ArticuloDeAyuda } from '@/components/organisms/Ayuda/ArticuloDeAyuda';
import { AyudaShell } from '@/components/organisms/Ayuda/AyudaShell';
import { ARTICULOS, articuloPorSlug } from '@/content/ayuda/articulos';
import { AppHeader } from '@praxis/commons';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return ARTICULOS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const articulo = articuloPorSlug(slug);
  return { title: articulo ? `${articulo.titulo} · Ayuda` : 'Ayuda' };
}

export default async function ArticuloPage({ params }: Props) {
  const { slug } = await params;
  const articulo = articuloPorSlug(slug);
  if (!articulo) notFound();

  const posicion = ARTICULOS.findIndex((a) => a.slug === slug);
  const anterior = posicion > 0 ? ARTICULOS[posicion - 1] : null;
  const siguiente = posicion < ARTICULOS.length - 1 ? ARTICULOS[posicion + 1] : null;

  return (
    <AppHeader title="Ayuda">
      <AyudaShell activo={slug}>
        <ArticuloDeAyuda articulo={articulo} />

        <nav
          aria-label="Más artículos"
          className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
        >
          {anterior ? (
            <Link
              href={`/ayuda/${anterior.slug}`}
              className="flex flex-col gap-0.5 rounded-xl border border-border p-4 transition-colors hover:bg-white/5"
            >
              <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                ← Anterior
              </span>
              <span className="font-sans text-[14px] font-semibold text-text-primary">
                {anterior.titulo}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {siguiente && (
            <Link
              href={`/ayuda/${siguiente.slug}`}
              className="flex flex-col gap-0.5 rounded-xl border border-border p-4 text-right transition-colors hover:bg-white/5"
            >
              <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Siguiente →
              </span>
              <span className="font-sans text-[14px] font-semibold text-text-primary">
                {siguiente.titulo}
              </span>
            </Link>
          )}
        </nav>
      </AyudaShell>
    </AppHeader>
  );
}
