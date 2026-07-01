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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${lora.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
