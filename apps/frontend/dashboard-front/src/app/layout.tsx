import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';
import { Archivo, Inter, Lora } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

/**
 * Las mismas familias que el shell: el usuario cruza de la landing al panel
 * sin que cambie la tipografía. `Redaction 50` se auto-hospeda en
 * `public/fonts/` y se declara en globals.css.
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

/** Solo para el logotipo "Praxis" del sidebar (`AppShell`) — la misma fuente
 * que navbar/footer de la landing, ver el comentario en
 * `web-shell/layout.tsx`. */
const grotesk = Archivo({
  variable: '--font-grotesk',
  subsets: ['latin'],
  display: 'swap',
  weight: ['700', '800'],
});

/** Khteka, copiada del repo de Kyloo — solo para el "By Kyloo" del sidebar,
 * mismo razonamiento que en `web-shell/layout.tsx`. */
const khteka = localFont({
  src: './fonts/khteka-medium.woff2',
  weight: '500',
  style: 'normal',
  display: 'swap',
  variable: '--font-khteka',
  fallback: ['Arial', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: 'Panel | Praxis',
    template: '%s | Praxis',
  },
  description: 'Tus proyectos, espacios y equipo en PRAXIS.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();

  return (
    <html
      lang="es"
      data-theme={theme}
      className={`${inter.variable} ${lora.variable} ${grotesk.variable} ${khteka.variable} h-full`}
    >
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
