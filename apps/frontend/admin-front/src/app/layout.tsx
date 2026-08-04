import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import './globals.css';

/**
 * Las mismas familias que el resto: el usuario cruza de zona sin que cambie la
 * tipografía. `Redaction 50` se auto-hospeda en `public/fonts/` y se declara en
 * globals.css con el basePath de esta zona.
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
  title: {
    default: 'Administración | Praxis',
    template: '%s | Praxis',
  },
  description: 'Cuentas, proyectos y el registro de lo que se hace con ellos.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();

  return (
    <html lang="es" data-theme={theme} className={`${inter.variable} ${lora.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
