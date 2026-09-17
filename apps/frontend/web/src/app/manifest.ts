import type { MetadataRoute } from 'next';

/**
 * El manifiesto de la aplicación web — lo que hace que Chrome/Edge ofrezcan
 * el botón de instalar y que el resultado tenga icono, nombre y color propios
 * en vez de abrir como una pestaña más.
 *
 * ## Por qué es un archivo y no una línea en `layout.tsx`
 *
 * `manifest.ts` es una convención de Next (App Router): al vivir en la raíz
 * de `app/`, el framework lo sirve solo en `/manifest.webmanifest` y añade el
 * `<link rel="manifest">` en el `<head>` de cada página él mismo. No hace
 * falta enlazarlo a mano desde `RootLayout`.
 *
 * ## Los iconos, y por qué no son los mismos que `icon.png`
 *
 * `src/app/icon.png` (192×192) y `apple-icon.png` (180×180) son la
 * convención de Next para la pestaña del navegador y el icono de iOS al
 * añadir a inicio: Next los sirve como ruta y los declara solo. El manifiesto
 * necesita además un 512×512 —Chrome lo exige para considerar la app
 * «instalable»— así que los tres viven como ficheros estáticos en
 * `public/icons/`, generados del mismo SVG (`public/icons/praxis-mark.svg`,
 * la fuente de la que salen todos).
 *
 * ⚠️ **El SVG va primero y con `sizes: 'any'`.** Es vectorial: un launcher que
 * lo entienda nunca pixela el icono, sea cual sea la resolución de la
 * pantalla. Los PNG son el respaldo para quien no lo soporte (Safari, sobre
 * todo) — nunca al revés, o el vectorial se ignora aunque esté disponible.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Praxis — Gestión de proyectos',
    short_name: 'Praxis',
    description:
      'Tableros Kanban, permisos dinámicos, un asistente que propone y automatizaciones que actúan solas.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    /* El mismo casi-negro de la landing (`--l-bg` en landing-theme.css): la
       pantalla de carga de la app instalada tiene que fundirse con lo primero
       que se ve al abrirla, no con el `#0d0f14` azulado de la paleta general
       que ya se retiró de las pantallas reales. */
    background_color: '#080807',
    theme_color: '#080807',
    icons: [
      {
        src: '/icons/praxis-mark.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
