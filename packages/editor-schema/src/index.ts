import type { AnyExtension, JSONContent } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { Callout, ImagenDeDocumento, LinkCard } from './nodos.js';

export { Callout, ImagenDeDocumento, LinkCard } from './nodos.js';
export type { ModoDeEnlace, VarianteDeAviso } from './nodos.js';
export { reconocerProveedor, type Proveedor } from './proveedores.js';

/**
 * El campo del documento Yjs donde vive el contenido. El editor
 * (`Collaboration`) y el servidor tienen que usar **el mismo**, o cada uno
 * escribe en un sitio y el documento se ve vacío.
 */
export const CAMPO_YJS = 'default';

/**
 * Los nodos y marcas de un documento: **el esquema**, idéntico en el editor y
 * en el servidor. Si divergen, Yjs guarda cosas que el otro lado no sabe leer.
 *
 * Sin nada que dependa del navegador o de la edición (deshacer, cursor de
 * arrastre, marcadores de posición): eso lo añade el editor. Y sin subrayado:
 * Markdown no lo tiene, y guardarlo como HTML rompería «sin HTML» (D2).
 */
export function extensionesDelDocumento(): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false,
      underline: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Highlight,
    ImagenDeDocumento,
    Callout,
    LinkCard,
  ];
}

let gestor: MarkdownManager | null = null;
function markdown(): MarkdownManager {
  gestor ??= new MarkdownManager({ extensions: extensionesDelDocumento() });
  return gestor;
}

/** Markdown → el JSON de ProseMirror que entiende el editor. */
export function markdownAJson(md: string): JSONContent {
  const json = markdown().parse(md.replace(/\r\n?/g, '\n'));
  return json?.content?.length ? json : { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** El JSON del editor → Markdown. Es lo que se guarda como copia legible (E2). */
export function jsonAMarkdown(json: JSONContent): string {
  return markdown().serialize(json).trim();
}

/**
 * La descripción de una tarea: un Markdown **simplificado**.
 *
 * Solo lo que sirve para explicar una tarea con orden —subtítulos, negrita,
 * cursiva, tachado, listas, tareas marcables, citas, código y enlaces—. Sin
 * tablas, imágenes, avisos ni tarjetas: eso es de un documento, y una
 * descripción que los admitiera acabaría siendo uno. Lo que se guarda sigue
 * siendo texto en el mismo campo `description` de siempre, así que el backend,
 * PRAX y el MCP lo leen sin cambios.
 */
export function extensionesDeDescripcion(): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false,
      underline: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      horizontalRule: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    TaskList,
    TaskItem.configure({ nested: false }),
  ];
}

let gestorDeDescripcion: MarkdownManager | null = null;
function markdownDeDescripcion(): MarkdownManager {
  gestorDeDescripcion ??= new MarkdownManager({ extensions: extensionesDeDescripcion() });
  return gestorDeDescripcion;
}

/** Markdown de una descripción → el JSON que entiende el editor. */
export function descripcionAJson(md: string): JSONContent {
  const json = markdownDeDescripcion().parse(md.replace(/\r\n?/g, '\n'));
  return json?.content?.length ? json : { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** El JSON del editor → Markdown de la descripción. Vacío si no hay nada escrito. */
export function jsonADescripcion(json: JSONContent): string {
  return markdownDeDescripcion().serialize(json).trim();
}
