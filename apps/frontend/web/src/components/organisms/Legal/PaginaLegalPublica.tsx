import type { Articulo } from '@/content/ayuda/tipos';
import { ENTIDAD } from '@/content/legal';
import Link from 'next/link';
import { PaginaLegal } from './PaginaLegal';

/**
 * El marco **sin sesión** de los textos legales: se leen antes de registrarse,
 * desde el pie del landing y desde la pantalla de consentimiento de Google, así
 * que no pueden vivir tras el guard. Sin navegación de producto: una cabecera
 * mínima y la vuelta a la portada.
 */
export function PaginaLegalPublica({ documento }: { documento: Articulo }) {
  return (
    <div data-tone="dark" className="min-h-screen bg-background text-text-primary">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="font-display text-xl text-text-primary">
            {ENTIDAD.marca}
          </Link>
          <Link
            href="/auth/login"
            className="font-sans text-[13px] font-semibold text-text-secondary hover:text-text-primary"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>
      <main className="px-4 py-10 sm:px-6 sm:py-14">
        <PaginaLegal documento={documento} hrefDe={(s) => `/${s}`} />
      </main>
    </div>
  );
}
