import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PRAXIS — Acceso',
  description: 'Inicia sesión o crea tu cuenta en PRAXIS.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
