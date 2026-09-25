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
