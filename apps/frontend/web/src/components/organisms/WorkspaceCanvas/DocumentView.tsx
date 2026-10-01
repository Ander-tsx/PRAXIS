'use client';

import {
  deleteDocumentAction,
  renameDocumentAction,
} from '@/app/(privado)/projects/[id]/document-actions';
import {
  CompartirDocumento,
  DocumentEditor,
  ExportarDocumento,
  HistorialDeVersiones,
} from '@/components/organisms/DocumentEditor';
import { DOCUMENT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  Button,
  Dialog,
  type ProjectDocument,
  type UserProfile,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export interface DocumentViewProps {
  documento: ProjectDocument;
  projectId: string;
  /** Crear, editar y borrar documentos: `canEditDocuments`. */
  canEdit: boolean;
  usersById: Map<string, UserProfile>;
  onBorrado: () => void;
}

const fechaYHora = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Un documento dentro de su espacio (etapa 2 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * El editor es `DocumentEditor`: en vivo, en bloques, sin «Escribir/Leer» ni
 * botón de guardar. Aquí solo va lo que es del miembro del proyecto: renombrar,
 * compartir, el historial y borrar.
 */
export function DocumentView({
  documento,
  projectId,
  canEdit,
  usersById,
  onBorrado,
}: DocumentViewProps) {
  const [, renombrar] = useAccion(renameDocumentAction, DOCUMENT_INITIAL_STATE);
  const [estadoBorrado, borrar, borrando] = useAccion(deleteDocumentAction, DOCUMENT_INITIAL_STATE);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (estadoBorrado.done === 'deleted') onBorrado();
  }, [estadoBorrado.done, onBorrado]);

  const alRenombrar = useCallback(
    (title: string) => {
      const datos = new FormData();
      datos.set('projectId', projectId);
      datos.set('workspaceId', documento.workspaceId);
      datos.set('documentId', documento.id);
      datos.set('title', title);
      renombrar(datos);
    },
    [projectId, documento.workspaceId, documento.id, renombrar],
  );

  const autor = usersById.get(documento.updatedBy);

  return (
    <div data-tone="dark" className="scrollbar-slim min-h-0 flex-1 overflow-y-auto pt-4">
      <DocumentEditor
        documentId={documento.id}
        conSesion
        titulo={documento.title}
        onTitulo={canEdit ? alRenombrar : undefined}
        subtitulo={
          <>
            Editado {fechaYHora.format(new Date(documento.updatedAt))}
            {autor && ` por ${personLabel(autor)}`}
          </>
        }
        acciones={(modo, editor) => (
          <>
            <ExportarDocumento editor={editor} titulo={documento.title} />
            {modo === 'edit' && (
              <HistorialDeVersiones
                documentId={documento.id}
                k={null}
                editor={editor}
                usersById={usersById}
              />
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setConfirmar(true)}
                title="Borrar el documento"
                aria-label="Borrar el documento"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white/[0.07] hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {canEdit && <CompartirDocumento documentId={documento.id} />}
          </>
        )}
      />

      <Dialog
        tone="dark"
        open={confirmar}
        onClose={() => setConfirmar(false)}
        title={`Borrar «${documento.title || 'Sin título'}»`}
        size="sm"
      >
        <p className="font-sans text-sm text-text-secondary">
          Se borra para todo el mundo, también para quien lo tenga compartido. No se deshace.
        </p>
        {estadoBorrado.error && (
          <p role="alert" className="mt-3 font-sans text-xs text-error">
            {estadoBorrado.error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            isLoading={borrando}
            onClick={() => {
              const datos = new FormData();
              datos.set('projectId', projectId);
              datos.set('workspaceId', documento.workspaceId);
              datos.set('documentId', documento.id);
              borrar(datos);
            }}
          >
            Borrar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
