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
 * «instalable»— y un 1024×1024 para el Dock de macOS en pantallas Retina, así
 * que viven como ficheros estáticos en `public/icons/`, generados del mismo
 * SVG (`public/icons/praxis-mark.svg`, que se conserva como fuente pero no
 * se declara aquí — ver el aviso de abajo).
 *
 * 🔴 **El SVG estuvo aquí, primero y con `sizes: 'any'`, y se quitó.** En
 * teoría es lo correcto —vectorial, nunca pixela— y así lo tenía la primera
 * versión de este archivo. En la práctica, el icono instalado en el Dock de
 * macOS salía **diminuto y sin fondo**: un test con Chrome en modo headless
 * mostró que abre el SVG como página y lo pinta a su tamaño intrínseco
 * (`width="44" height="44"` en el archivo), sin escalarlo al tamaño de icono
 * pedido —el mismo fallo que reprodujo `qlmanage` de macOS con el archivo
 * sin tocar—. El `viewBox` es correcto y el archivo es válido; el fallo está
 * en cómo Chrome lo usa para generar el icono nativo de la app instalada, no
 * en el SVG. Con solo PNG en la lista, esa ruta nunca se toma: cada tamaño ya
 * viene rasterizado al pixel exacto que hace falta, sin ambigüedad que
 * resolver.
 *
 * Los tres PNG llevan además las esquinas redondeadas **horneadas en el
 * propio archivo** (transparencia real, no un `border-radius` que dependa de
 * que alguien lo aplique): el icono de instalar tiene que verse ya como un
 * icono de escritorio antes de que ningún sistema operativo le imponga su
 * propia máscara, look que sí llevaba diseñado el SVG original pero que se
 * perdía en cualquier renderizador que no respetara su `clip-path`.
 *
 * ⚠️ **Y llevan margen alrededor — a propósito, y solo estos tres.** La
 * primera versión rellenaba el lienzo entero (el cuadrado blanco a sangre, sin
 * aire), y junto a los demás iconos del Dock de macOS se veía **más grande**
 * que el resto: no es una ilusión óptica, es que macOS espera que el dibujo
 * visible del icono ocupe **~80 %** del lienzo (824 sobre 1024, la plantilla
 * de Apple para Big Sur en adelante), centrado, con el resto transparente — al
 * revés que iOS, que va a sangre porque el sistema pone su propia máscara. Sin
 * ese margen, el nuestro competía en tamaño contra iconos que ya lo llevaban
 * incorporado y perdía por exceso. El radio de la esquina se reescala con el
 * mismo factor (824/1024) para que sigan siendo la misma forma, solo más
 * pequeña. `apple-icon.png` e `icon.png` (arriba) **no** llevan este margen:
 * ahí sí toca ir a sangre, uno porque iOS lo exige y el otro porque es la
 * pestaña del navegador, no el Dock.
 *
 * ⚠️ **`icon.png` es el ÚNICO favicon, y lleva las esquinas redondeadas.**
 * Cada sección (`auth`, `main`, `projects`, `chat`, `assistant`, `admin`)
 * tenía el suyo —el trébol de antes de la X— y Next le da prioridad al del
 * segmento más profundo, así que la pestaña enseñaba la marca vieja en toda
 * la aplicación y la nueva solo en la landing. Se borraron: sin ellos, todas
 * heredan este. `apple-icon.png` sigue cuadrado porque iOS pone su máscara.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    /* `id` fija la identidad de la app instalada: sin él es `start_url`, y
       cambiar la URL de arranque la convertiría en otra app para el sistema. */
    id: '/',
    name: 'Praxis — Gestión de proyectos',
    short_name: 'Praxis',
    description:
      'Tableros Kanban, permisos dinámicos, un asistente que propone y automatizaciones que actúan solas.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone'],
    lang: 'es-MX',
    dir: 'ltr',
    categories: ['productivity', 'business'],
    /* El mismo casi-negro de la landing (`--l-bg` en landing-theme.css): la
       pantalla de carga de la app instalada tiene que fundirse con lo primero
       que se ve al abrirla, no con el `#0d0f14` azulado de la paleta general
       que ya se retiró de las pantallas reales. */
    background_color: '#080807',
    theme_color: '#080807',
    icons: [
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
      {
        src: '/icons/icon-1024.png',
        sizes: '1024x1024',
        type: 'image/png',
      },
      /**
       * Los `maskable`: Android recorta el icono con la forma de su lanzador
       * (círculo, gota, cuadrado redondeado). Sin ellos pinta el nuestro dentro
       * de un círculo blanco, encogido. Estos van a sangre en blanco y la X
       * ocupa el 66 %, dentro del círculo seguro del 80 % que define la
       * especificación. Ver M1 de `docs/PLAN-MOVIL.md`.
       */
      {
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    /* Mantener pulsado el icono instalado: los tres sitios a los que se entra. */
    shortcuts: [
      {
        name: 'Proyectos',
        url: '/projects',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Chat',
        url: '/chat',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'PRAX',
        url: '/assistant',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
