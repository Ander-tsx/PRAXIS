import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import './globals.css';

/**
 * Las mismas familias que el resto de zonas.
 *
 * Antes auth-front no cargaba `next/font` y caía a `system-ui`, así que el
 * salto landing → login cambiaba de tipografía a media navegación. Los tokens
 * `--font-sans` y `--font-serif` de commons esperan estas dos variables.
 */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
});

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
    <html lang="es" className={`${inter.variable} ${lora.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
