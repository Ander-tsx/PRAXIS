'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { srcDeImagen, useDocumento } from './contexto';

/**
 * Una imagen del documento. Se guarda con la ruta del gateway y aquí se le
 * pone la de esta aplicación y el token del enlace, si se entró por él: el
 * control de acceso es el del documento (E6 de `docs/PLAN-DOCUMENTOS.md`).
 */
export function VistaImagen({ node, selected }: ReactNodeViewProps) {
  const { k } = useDocumento();
  return (
    <NodeViewWrapper className="my-4" data-drag-handle>
      <img
        src={srcDeImagen(node.attrs.src ?? '', k)}
        alt={node.attrs.alt ?? ''}
        title={node.attrs.title ?? undefined}
        loading="lazy"
        className={`mx-auto max-h-[70vh] max-w-full rounded-lg ${selected ? 'ring-2 ring-primary/60' : ''}`}
      />
    </NodeViewWrapper>
  );
}
