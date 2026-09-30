import { BadRequestException } from '@nestjs/common';

/**
 * Tope de una imagen de identidad (foto de perfil, imagen de organización o de
 * proyecto): 2 MB.
 *
 * Mucho menos que un adjunto del chat (25 MB) a propósito: se pinta en cada
 * burbuja, lista y selector, y de 2 MB ya salen 512 px de sobra. Lo que se evita
 * es que alguien suba una foto de cámara sin recortar y la pague todo el que
 * abra la pantalla.
 */
export const IMAGEN_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Tipos que se aceptan.
 *
 * ⚠️ **Sin SVG**, por el mismo motivo que en el chat y en los adjuntos de
 * tarea: es XML con scripts, y servirlo desde el mismo origen que la aplicación
 * es XSS con todas las letras.
 */
export const IMAGEN_MIME_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** ¿Los primeros bytes dicen lo mismo que el `Content-Type` declarado? */
export function firmaDeImagenValida(mimeType: string, contenido: Uint8Array): boolean {
  const empiezaPor = (firma: number[], offset = 0) =>
    contenido.length >= offset + firma.length &&
    firma.every((byte, i) => contenido[offset + i] === byte);

  if (mimeType === 'image/png') return empiezaPor([0x89, 0x50, 0x4e, 0x47]);
  if (mimeType === 'image/jpeg') return empiezaPor([0xff, 0xd8, 0xff]);
  if (mimeType === 'image/webp')
    return empiezaPor([0x52, 0x49, 0x46, 0x46]) && empiezaPor([0x57, 0x45, 0x42, 0x50], 8);
  return false;
}

/**
 * Las tres comprobaciones que van antes de guardar una imagen subida: que llegó,
 * que es de un tipo permitido y que **los bytes son lo que dice el tipo** — el
 * `mimetype` lo declara quien sube.
 */
export function validarImagenSubida(file: Express.Multer.File | undefined): asserts file {
  if (!file) throw new BadRequestException('No llegó ningún archivo en el campo «file»');
  if (!(IMAGEN_MIME_PERMITIDOS as readonly string[]).includes(file.mimetype)) {
    throw new BadRequestException('La imagen tiene que ser PNG, JPEG o WebP.');
  }
  if (file.size === 0) throw new BadRequestException('El archivo está vacío');
  if (!firmaDeImagenValida(file.mimetype, file.buffer)) {
    throw new BadRequestException('Ese archivo no es la imagen que dice ser.');
  }
}
