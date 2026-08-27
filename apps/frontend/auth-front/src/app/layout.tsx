import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';
import { Archivo, Fraunces, Inter, Lora } from 'next/font/google';
import localFont from 'next/font/local';
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

/**
 * Solo para `AuthPanel` (login/signup) — la misma fuente que la landing
 * usa para sus titulares (`web-shell/layout.tsx`), necesaria aquí porque el
 * panel de acceso adopta el mismo lenguaje editorial que la landing pública
 * en vez del tema de producto habitual.
 */
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
  weight: 'variable',
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT'],
});

/** Solo para el wordmark "Praxis" de `AuthPanel` — la misma fuente que el
 * logotipo en navbar/footer de la landing, ver el comentario en
 * `web-shell/layout.tsx`. */
const grotesk = Archivo({
  variable: '--font-grotesk',
  subsets: ['latin'],
  display: 'swap',
  weight: ['700', '800'],
});

/** Khteka, copiada del repo de Kyloo — solo para el "By Kyloo" de
 * `AuthPanel`, mismo razonamiento que en `web-shell/layout.tsx`. */
const khteka = localFont({
  src: './fonts/khteka-medium.woff2',
  weight: '500',
  style: 'normal',
  display: 'swap',
  variable: '--font-khteka',
  fallback: ['Arial', 'sans-serif'],
});

/** Animo y Suisse Mono, las dos de Kyloo. Van en las ocho zonas porque
 *  `theme.css` las nombra en `--font-sans` y `--font-mono`, y una zona que no
 *  las cargue invalida esas dos declaraciones enteras. */
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
  fallback: ['monospace'],
});

export const metadata: Metadata = {
  title: 'PRAXIS — Acceso',
  description: 'Inicia sesión o crea tu cuenta en PRAXIS.',
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
      className={`${inter.variable} ${lora.variable} ${fraunces.variable} ${grotesk.variable} ${khteka.variable} ${animo.variable} ${suisseMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
