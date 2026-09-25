import { CAMPO_YJS, extensionesDelDocumento, jsonAMarkdown, markdownAJson } from '@praxis/editor-schema';
import { getSchema } from '@tiptap/core';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

/**
 * Entre el estado en vivo (Yjs) y su copia en Markdown (E2), con **el mismo
 * esquema que el editor** (`@praxis/editor-schema`).
 */
/* `as never`: el paquete del esquema es CJS y este servicio ESM, así que
   TypeScript ve dos copias de los tipos de TipTap. En ejecución es la misma. */
const esquema = getSchema(extensionesDelDocumento() as never);

/** Un documento viejo, que solo tiene Markdown, como actualización de Yjs. */
export function markdownAEstado(markdown: string): Uint8Array {
  const doc = prosemirrorJSONToYDoc(esquema, markdownAJson(markdown), CAMPO_YJS);
  return Y.encodeStateAsUpdate(doc);
}

export function estadoAMarkdown(doc: Y.Doc): string {
  return jsonAMarkdown(yDocToProsemirrorJSON(doc, CAMPO_YJS));
}
