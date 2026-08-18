import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Multi-Zones: esta zona vive bajo `/chat` y el web-shell la expone con un
   * rewrite. Dentro de la zona las rutas se escriben **sin** el prefijo.
   * Ver ESTADO-ACTUAL §16.
   */
  basePath: '/chat',

  /**
   * ⚠️ **El tope por defecto de una Server Action es 1 MB, y el chat admite 25.**
   *
   * Subir un archivo va por `uploadAttachmentAction`, así que con el valor por
   * defecto todo lo que pasara de 1 MB moría en el servidor con «Body exceeded
   * 1 MB limit» —un error de Next que solo se ve en la consola— mientras la
   * interfaz se quedaba girando. Estaba puesto en `projects-front` y
   * `dashboard-front` y faltaba justo aquí, que es la zona donde de verdad se
   * comparten archivos.
   *
   * El límite de verdad lo sigue poniendo el gateway, que es quien puede; esto
   * es el mismo tope más margen para la sobrecarga del `multipart`.
   */
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },

  transpilePackages: ['@praxis/commons'],
};

export default nextConfig;
