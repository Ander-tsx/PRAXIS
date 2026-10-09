import { PaginaLegalPublica } from '@/components/organisms/Legal/PaginaLegalPublica';
import { documentoLegal } from '@/content/legal';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Términos y condiciones — Praxis',
  description: 'Texto vigente, público y sin necesidad de iniciar sesión.',
  alternates: { canonical: '/terminos' },
};

export default function Page() {
  const documento = documentoLegal('terminos');
  if (!documento) notFound();
  return <PaginaLegalPublica documento={documento} />;
}
