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
 * Sin `data-theme` de la cookie, a propósito.
 *
 * El shell no sirve páginas de negocio (CLAUDE.md) — lo único que hay aquí es
 * el landing público, y sus organismos (`LandingHero`, `LandingCTA`, …) tienen
 * colores incrustados que no se tocaron en esta pasada: quedan fuera del
 * alcance del tema claro (ver `commons/molecules/FeatureCard`, que sí se
 * arregló porque además la usa este mismo landing). Si el `<html>` heredara
 * `data-theme="light"` de la cookie compartida, el texto del landing —gris
 * claro sobre fondo ahora blanco— se volvería ilegible sin que nadie lo haya
 * pedido. El landing se queda oscuro siempre, y el selector de Configuración
 * solo afecta a las cuatro zonas privadas.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-theme="dark" className={`${inter.variable} ${lora.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
