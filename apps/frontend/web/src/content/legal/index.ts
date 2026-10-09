import type { Articulo } from '@/content/ayuda/tipos';
import { PRIVACIDAD } from './privacidad';
import { TERMINOS } from './terminos';

export { ENTIDAD } from './entidad';

/** Los dos textos legales, en el orden en que se enseñan. */
export const DOCUMENTOS_LEGALES: Articulo[] = [TERMINOS, PRIVACIDAD];

export function documentoLegal(slug: string): Articulo | undefined {
  return DOCUMENTOS_LEGALES.find((d) => d.slug === slug);
}
