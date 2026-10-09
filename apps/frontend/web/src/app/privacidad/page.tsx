import { PaginaLegalPublica } from '@/components/organisms/Legal/PaginaLegalPublica';
import { documentoLegal } from '@/content/legal';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Aviso de privacidad — Praxis',
  description: 'Texto vigente, público y sin necesidad de iniciar sesión.',
  alternates: { canonical: '/privacidad' },
};

export default function Page() {
  const documento = documentoLegal('privacidad');
  if (!documento) notFound();
  return <PaginaLegalPublica documento={documento} />;
}
