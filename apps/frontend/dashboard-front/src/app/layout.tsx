import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

const khteka = localFont({
  src: './fonts/khteka-medium.woff2',
  weight: '500',
  style: 'normal',
  display: 'swap',
  variable: '--font-khteka',
  fallback: ['Arial', 'sans-serif'],
});

const animo = localFont({
  src: './fonts/animo-normal-regular.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-animo',
  fallback: ['Arial', 'sans-serif'],
});

const suisseMono = localFont({
  src: './fonts/suisseintlmono-regular-webxl.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-suisse-mono',
  fallback: ['Arial', 'sans-serif'],
});

/** Solo para el logotipo "Praxis" del sidebar (`AppShell`) */
const grotesk = Archivo({
  variable: '--font-grotesk',
  subsets: ['latin'],
  display: 'swap',
  weight: ['700', '800'],
});

export const metadata: Metadata = {
  title: 'Praxis — Área de trabajo',
  description: 'Gestión de proyectos',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = await getTheme();
  return (
    <html
      lang="es-MX"
      className={`${khteka.variable} ${animo.variable} ${suisseMono.variable} ${grotesk.variable} antialiased`}
      data-theme={theme}
    >
      {/* La selección va por tokens: `beige-*` y `black-*` son nombres del repo
          de Kyloo y aquí no existen, así que se descartaban en silencio. Y el
          tema se elige con `data-theme`, no con la clase `.dark`, de modo que
          un `dark:` tampoco casaría nunca — el token ya cambia solo. */}
      <body className="bg-background text-text-primary selection:bg-text-primary selection:text-text-inverse">
        {children}
      </body>
    </html>
  );
}
