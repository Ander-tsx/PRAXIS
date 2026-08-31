import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Multi-Zones: esta zona es `/main`. Sus rutas en el código no lo
   * incluyen, pero Next se lo añade y el shell asume que todas sus páginas
   * cuelgan de ahí.
   */
  basePath: '/main',

  /**
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],

  /**
   * ⚠️ **El tope por defecto de una Server Action es 1 MB, y el chat admite 25.**
   *
   * Subir un archivo va por una acción, así que con el valor por defecto todo
   * lo que pasara de 1 MB moría en el servidor con «Body exceeded 1 MB limit»
   * —un error que solo se ve en la consola— mientras la interfaz se quedaba
   * girando. Se sube al mismo tope que valida el backend, más un margen para
   * la sobrecarga del `multipart`: el límite de verdad lo sigue poniendo el
   * gateway, que es quien puede.
   */
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },

  /**
   * La bandeja de avisos se mudó al panel (E4).
   *
   * ## Por qué esto existe
   *
   * Hay **enlaces vivos** a `/dashboard/notifications` que no controlamos: los
   * correos ya enviados apuntan ahí, y también las tarjetas de aviso que alguien
   * tenga abiertas. Borrar la ruta sin más los convertiría todos en un 404 por
   * una decisión de arquitectura que a quien pulsa no le importa.
   *
   * ⚠️ **Va aquí y no en un `page.tsx` con `permanentRedirect()`**, que fue el
   * primer intento. Aquello **no** devolvía un 308: Next resolvía el destino por
   * dentro y servía el panel con **200 en la URL vieja**, sin cabecera
   * `Location`. Funcionar, funcionaba —se veía el panel— pero la barra de
   * direcciones se quedaba en `/dashboard/notifications`, así que el marcador de
   * quien lo guardara nunca se actualizaba y la dirección vieja no moría nunca.
   * Comprobado con `curl -D -`: sin `Location`, no hay redirección.
   *
   * ⚠️ **Los parámetros cambian de nombre, no solo la ruta.** En el panel la
   * bandeja comparte URL con las demás secciones, así que su filtro va prefijado
   * (`avisos_filtro`). Un redirect que dejara `?filtro=sin-leer` llevaría a un
   * parámetro que el panel **ignora en silencio**: el enlace funcionaría, pero
   * abriría la bandeja sin filtrar y nadie sabría por qué. Por eso hay dos
   * entradas y la del filtro va **primera** — se evalúan en orden.
   *
   * ⚠️ Next **reenvía la query original además** de la del destino, así que la
   * URL final queda `?filtro=sin-leer&avisos_filtro=sin-leer`. El sobrante es
   * inerte —el panel solo lee el prefijado— y no hay forma de descartarlo desde
   * `redirects()`. Es feo y funciona; se deja anotado para que nadie lo lea como
   * un descuido. Verificado por comportamiento: la bandeja pasa de 4 avisos a 3
   * al llegar por esa ruta.
   *
   * `source` es relativo al `basePath`, así que `/notifications` casa con
   * `/dashboard/notifications`.
   *
   * ⚠️ `permanent: true` es un 308 y los navegadores lo cachean con ganas. Es lo
   * correcto —la dirección se movió para siempre— pero si algún día se revierte
   * la mudanza, esa caché sobrevive al despliegue.
   */
  async redirects() {
    return [
      {
        source: '/notifications',
        has: [{ type: 'query', key: 'filtro', value: 'sin-leer' }],
        destination: '/?avisos_filtro=sin-leer',
        permanent: true,
      },
      { source: '/notifications', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
