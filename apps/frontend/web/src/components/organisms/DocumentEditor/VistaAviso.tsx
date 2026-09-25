'use client';

import type { VarianteDeAviso } from '@praxis/editor-schema';
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { AlertTriangle, Info, Lightbulb, OctagonAlert, Star } from 'lucide-react';
import { useDocumento } from './contexto';

const VARIANTES: Record<VarianteDeAviso, { icono: typeof Info; tono: string; nombre: string }> = {
  note: { icono: Info, tono: 'var(--color-info)', nombre: 'Nota' },
  tip: { icono: Lightbulb, tono: 'var(--color-success)', nombre: 'Consejo' },
  important: { icono: Star, tono: 'var(--color-primary)', nombre: 'Importante' },
  warning: { icono: AlertTriangle, tono: 'var(--color-warning)', nombre: 'Cuidado' },
  caution: { icono: OctagonAlert, tono: 'var(--color-error)', nombre: 'Peligro' },
};
const ORDEN: VarianteDeAviso[] = ['note', 'tip', 'important', 'warning', 'caution'];

/**
 * Un aviso (`> [!NOTE]` en Markdown). El icono cambia de tipo con un clic:
 * nota, consejo, importante, cuidado, peligro — sin menú para una elección de
 * cinco.
 */
export function VistaAviso({ node, updateAttributes }: ReactNodeViewProps) {
  const { editable } = useDocumento();
  const variante = (
    ORDEN.includes(node.attrs.variant) ? node.attrs.variant : 'note'
  ) as VarianteDeAviso;
  const { icono: Icono, tono, nombre } = VARIANTES[variante];

  return (
    <NodeViewWrapper
      as="aside"
      className="my-3 flex gap-3 rounded-xl border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, ${tono} 35%, transparent)`,
        background: `color-mix(in srgb, ${tono} 8%, transparent)`,
      }}
    >
      <button
        type="button"
        contentEditable={false}
        disabled={!editable}
        title={editable ? `${nombre} · clic para cambiar` : nombre}
        onClick={() =>
          updateAttributes({ variant: ORDEN[(ORDEN.indexOf(variante) + 1) % ORDEN.length] })
        }
        className="mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center disabled:cursor-default"
        style={{ color: tono }}
      >
        <Icono className="h-4 w-4" />
      </button>
      <NodeViewContent className="min-w-0 flex-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
    </NodeViewWrapper>
  );
}
