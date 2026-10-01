/**
 * La documentación de Praxis, **como datos**.
 *
 * Cada artículo es una lista de bloques tipados y no un trozo de Markdown: así el
 * índice lateral, el buscador y los enlaces anterior/siguiente salen del mismo
 * sitio, y una pantalla nueva no necesita un procesador de Markdown en el
 * cliente. Si una sección cambia, se edita aquí y la ayuda no se queda hablando
 * de otra versión de la aplicación.
 *
 * El texto admite **negritas** con doble asterisco y `código` con acentos
 * graves; nada más. Ver `Texto` en `ArticuloDeAyuda`.
 */

export type Bloque =
  | { tipo: 'h2'; texto: string }
  | { tipo: 'p'; texto: string }
  | { tipo: 'lista'; items: string[] }
  | { tipo: 'pasos'; items: string[] }
  | { tipo: 'consejo'; texto: string }
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'tabla'; cabecera: string[]; filas: string[][] };

export interface Articulo {
  /** Va en la URL: `/ayuda/<slug>`. Sin acentos ni espacios. */
  slug: string;
  titulo: string;
  /** Una frase: sale en el índice y en los resultados de búsqueda. */
  resumen: string;
  categoria: string;
  /** Dónde se hace lo que explica el artículo, si hay un sitio al que llevar. */
  irA?: { etiqueta: string; href: string };
  bloques: Bloque[];
}

export interface Categoria {
  nombre: string;
  descripcion: string;
}
