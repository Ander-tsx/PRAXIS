import type { MetadataRoute } from 'next';

/**
 * robots.txt de la aplicación.
 *
 * - La landing (`/`) y las pantallas de entrada (`/auth/login`, `/auth/signup`)
 *   son rastreables: el `noindex` de login/signup va por metadata (para que el
 *   crawler pueda ver la directiva hay que dejarlo entrar).
 * - El área privada (`/main`, `/projects`, `/chat`, `/assistant`, `/admin`) y
 *   las APIs (`/api/*`, `/auth/api/*`) no se rastrean: exigen sesión y su
 *   contenido nunca es indexable.
 * - No se bloquean `_next/`, `fonts/`, `icons/` ni `media/`: el crawler los
 *   necesita para renderizar.
 */
const SITIO = 'https://usepraxis.space';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/api/', '/main/', '/projects/', '/chat/', '/assistant/', '/admin/'],
      },
    ],
    sitemap: `${SITIO}/sitemap.xml`,
  };
}
