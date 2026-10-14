import { RegistroDelServiceWorker } from '@/components/organisms/ServiceWorker/RegistroDelServiceWorker';
import { getTheme } from '@praxis/commons/theme';
import type { Metadata, Viewport } from 'next';
import { Archivo, Fraunces, Inter, Lora } from 'next/font/google';
import localFont from 'next/font/local';
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

/**
 * Solo para la landing pública — no toca `--font-display` de
 * `commons/theme.css` (Redaction 50), que sigue siendo la voz del producto
 * dentro de la aplicación. La landing necesita un registro más serio y
 * editorial que el que Redaction 50 —pensado para dentro de la app— podía
 * dar en titulares a tamaño de cartel.
 */
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
  weight: 'variable',
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT'],
});

/**
 * Solo para el logotipo "Praxis" — navbar y el cierre del footer. Kyloo pinta
 * su propio nombre con Khteka, una fuente de estudio con licencia comercial
 * que no está en Google Fonts; Archivo en 800 y tracking cerrado busca el
 * mismo carácter — grotesca, geométrica, confiada — para el nombre de
 * Praxis en concreto, que no es el mismo producto que Kyloo y no debería
 * llevar la tipografía de otro estudio como si fuera la suya propia.
 */
const grotesk = Archivo({
  variable: '--font-grotesk',
  subsets: ['latin'],
  display: 'swap',
  weight: ['700', '800'],
});

/**
 * Khteka en sí — la fuente de estudio de Kyloo, copiada tal cual de su
 * propio repo (`KylooPage/src/app/fonts/khteka-medium.woff2`). A diferencia
 * de "Praxis" arriba, aquí SÍ es la fuente real: el wordmark del cierre del
 * footer no dice "Praxis" con letras prestadas, dice "Kyloo" — es la marca
 * de Kyloo citándose a sí misma como autora, y las dos propiedades son del
 * mismo estudio. Si esa relación cambiara, este es el único sitio que
 * dejaría de tener sentido.
 */
const khteka = localFont({
  src: './fonts/khteka-medium.woff2',
  weight: '500',
  style: 'normal',
  display: 'swap',
  variable: '--font-khteka',
  fallback: ['Arial', 'sans-serif'],
});

/**
 * Dominio canónico del sitio. Una sola constante lógica: `robots.ts` y
 * `sitemap.ts` usan el mismo valor a pelo porque son rutas, no páginas, y no
 * pueden importar metadata de aquí.
 */
const SITIO_CANONICO = 'https://usepraxis.space';

export const metadata: Metadata = {
  metadataBase: new URL(SITIO_CANONICO),
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
    url: '/',
    siteName: 'Praxis',
    images: [
      {
        url: '/icons/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Praxis — Gestión de proyectos',
      },
    ],
    type: 'website',
    locale: 'es_MX',
  },
  /**
   * iOS instalada (M1 de `docs/PLAN-MOVIL.md`). Safari no lee el manifiesto
   * para esto: sin `appleWebApp` abre con su propia barra, con el título de la
   * página y una pantalla en blanco al arrancar.
   *
   * - `black-translucent`: la app se dibuja bajo la barra de estado (con
   *   `viewport-fit=cover` y las utilidades `pt-safe`), como una nativa.
   * - Las pantallas de arranque van por tamaño exacto de pantalla: iOS no
   *   escala ninguna, y si no hay una para ese teléfono, enseña blanco.
   */
  appleWebApp: {
    capable: true,
    title: 'Praxis',
    statusBarStyle: 'black-translucent',
    startupImage: [
      [1290, 2796, 430, 932, 3],
      [1179, 2556, 393, 852, 3],
      [1284, 2778, 428, 926, 3],
      [1170, 2532, 390, 844, 3],
      [1125, 2436, 375, 812, 3],
      [1242, 2688, 414, 896, 3],
      [828, 1792, 414, 896, 2],
      [750, 1334, 375, 667, 2],
    ].map(([w, h, cw, ch, dpr]) => ({
      url: `/icons/arranque/${w}x${h}.png`,
      media: `(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    })),
  },
  /* ⚠️ Next 16 convierte `appleWebApp.capable` en `mobile-web-app-capable`, que
     iOS no lee para esto. Sin `apple-mobile-web-app-capable` la PWA instalada
     arranca en un modo a medias: la ventana acaba sobre la zona del indicador de
     inicio, con `env(safe-area-inset-bottom)` en 0 y una franja negra abajo. */
  other: { 'apple-mobile-web-app-capable': 'yes' },
  twitter: {
    card: 'summary_large_image',
    title: 'Praxis — Gestión de proyectos inteligente',
    description: 'Tableros Kanban, permisos dinámicos y reportes para tu equipo.',
    images: ['/icons/icon-512.png'],
  },
};

/**
 * Exporte aparte y no un campo de `metadata`: desde Next 14, `themeColor`
 * dejó de leerse ahí y solo cuenta si viene de `viewport`/`generateViewport`
 * (`generate-viewport.md`). Sin esto, `manifest.ts` sigue declarando su
 * `theme_color` para la app instalada, pero la pestaña normal del navegador
 * no coloreaba la barra — dos sitios que tenían que decir el mismo negro y
 * solo uno lo decía.
 */
export const viewport: Viewport = {
  themeColor: '#080807',
  /* Móvil (docs/PLAN-MOVIL.md, M0). `cover`: la app se dibuja también bajo el
     notch, y las utilidades `pt-safe`/`pb-safe` devuelven ese hueco donde haga
     falta. `resizes-content`: al abrir el teclado se encoge la ventana en vez de
     taparla, que es lo que deja un compositor pegado encima del teclado. Las dos
     son inertes en escritorio. */
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

/**
 * El layout raíz de **toda** la aplicación: la landing pública, las pantallas
 * de sesión y las cinco secciones privadas.
 *
 * Lee la cookie de tema (`praxis_theme`) y estampa `data-theme` en el `<html>`.
 * No es para la landing —es monocroma y fija, ver `globals.css`, clases
 * `.landing` / `.landing-light`— sino para todo lo demás, que sí lo usa.
 *
 * ⚠️ **Aquí viven las fuentes y el `<html>`/`<body>`, una sola vez.** Cuando
 * esto era un multi-zone cada zona repetía este archivo entero: cinco
 * declaraciones de las mismas familias y cinco `<body>` que tenían que coincidir
 * entre sí para que cruzar de zona no cambiara nada a la vista.
 */
/**
 * Con `praxis_theme=system` el servidor no sabe qué prefiere el navegador y pinta oscuro. Este script
 * va **en la cabecera, antes del primer pintado**, lee la cookie y pone el tema que toca: así quien
 * sigue al sistema en claro no ve un fogonazo oscuro. También escucha los cambios del sistema.
 * Con `dark` o `light` no hace nada: el servidor ya los pintó.
 */
const SCRIPT_DE_TEMA = `(function(){try{var m=document.cookie.match(/(?:^|; )praxis_theme=([^;]+)/);if(!m||decodeURIComponent(m[1])!=='system')return;var q=matchMedia('(prefers-color-scheme: light)');var a=function(){document.documentElement.setAttribute('data-theme',q.matches?'light':'dark')};a();q.addEventListener('change',a)}catch(e){}})()`;

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
      /* El script de la cabecera puede cambiar `data-theme` antes de hidratar. */
      suppressHydrationWarning
      className={`${inter.variable} ${lora.variable} ${fraunces.variable} ${grotesk.variable} ${khteka.variable} h-full`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: es una constante nuestra, sin datos de nadie */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />
      </head>
      {/*
        ⚠️ **Sin `flex flex-col`, y no es cosmético.**

        Lo llevaba cuando esta app solo servía la landing. Desde F2 de la fusión
        también sirve pantallas de la aplicación, y un `<body>` en columna flex
        cambia cómo se reparte el alto de `AppShell`. La landing no lo echa de
        menos: `LandingTemplate` ya trae su propio `flex min-h-screen flex-col`.
      */}
      <body className="min-h-full antialiased">
        {children}
        {/* El service worker, en toda la app —la landing incluida—: sin él no
            se instala bien ni abre sin red. Ver `docs/PLAN-MOVIL.md`, M1. */}
        <RegistroDelServiceWorker />
      </body>
    </html>
  );
}
