import { PaginaLegal } from '@/components/organisms/Legal/PaginaLegal';
import { DOCUMENTOS_LEGALES, documentoLegal } from '@/content/legal';
import { AppHeader } from '@praxis/commons';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return DOCUMENTOS_LEGALES.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: documentoLegal(slug)?.titulo ?? 'Legal' };
}

/**
 * Términos y aviso de privacidad **dentro de la aplicación**, en Configuración.
 * El mismo texto que las páginas públicas, con el marco privado.
 */
export default async function LegalPage({ params }: Props) {
  const { slug } = await params;
  const documento = documentoLegal(slug);
  if (!documento) notFound();

  return (
    <AppHeader title={documento.titulo}>
      <PaginaLegal documento={documento} hrefDe={(s) => `/main/legal/${s}`} />
    </AppHeader>
  );
}
