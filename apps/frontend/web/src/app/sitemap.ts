import type { MetadataRoute } from 'next';

/**
 * Sitemap de la aplicación.
 *
 * Solo URLs públicas, indexables y canónicas. La landing es la única con
 * contenido indexable: login/signup llevan `noindex` por metadata y el área
 * privada exige sesión, así que ninguna de esas entra aquí.
 */
const SITIO = 'https://usepraxis.space';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITIO}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITIO}/terminos`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITIO}/privacidad`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
