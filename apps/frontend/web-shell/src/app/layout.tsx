import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import './globals.css';

/* ── Google Fonts ──────────────────────────────────────────── */
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
    default: 'Praxis — Gestión de proyectos inteligente',
    template: '%s | Praxis',
  },
  description:
    'Praxis es una plataforma de gestión de proyectos con tableros Kanban, permisos dinámicos y reportes de desviación en tiempo real.',
  keywords: ['gestión de proyectos', 'kanban', 'equipo', 'productividad'],
  authors: [{ name: 'Equipo Praxis' }],
  openGraph: {
    title: 'Praxis — Gestión de proyectos inteligente',
    description: 'Tableros Kanban, permisos dinámicos y reportes para tu equipo.',
    type: 'website',
    locale: 'es_MX',
  },
};

/**
 * El shell **sí** lee la cookie de tema, igual que las otras cuatro zonas.
 *
 * ## Por qué antes no lo hacía
 *
 * Estuvo fijado a `data-theme="dark"` y era la decisión correcta entonces: los
 * organismos del landing llevaban **noventa y dos colores incrustados**, y la
 * mitad eran blancos con alfa que hacían de texto, de borde y de superficie
 * sobre fondo oscuro. Heredar `light` los dejaba invisibles sobre blanco, así
 * que se prefirió un landing oscuro a uno roto.
 *
 * Ya no aplica: los seis organismos pasaron a `colors`/`alpha()` de
 * `commons/tokens`, así que el landing responde al tema como cualquier otra
 * pantalla. Y como es la única zona pública, trae su propio selector en
 * `PublicNavbar` — quien entra sin cuenta no tiene una Configuración donde
 * elegirlo.
 *
 * ⚠️ La cookie es **la misma** (`praxis_theme`, `path=/`): cambiar el tema en el
 * landing lo cambia también dentro de la aplicación, y al revés. Es lo que se
 * espera de un selector de tema, y lo que evita que entrar en sesión te cambie
 * el aspecto sin haber tocado nada.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();

  return (
    <html lang="es" data-theme={theme} className={`${inter.variable} ${lora.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
