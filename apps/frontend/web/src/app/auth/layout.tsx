import type { Metadata } from 'next';

/**
 * Metadata del segmento de autenticación.
 *
 * Las pantallas de entrada son `'use client'` y no pueden exportar metadata:
 * sin este layout heredarían el title/description de la landing y competirían
 * con ella. Llevan `noindex` porque ninguna pantalla de sesión debe indexarse.
 */
export const metadata: Metadata = {
  title: {
    default: 'Acceso',
    template: '%s | Praxis',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
