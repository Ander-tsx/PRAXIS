'use client';

import { createDocumentAction } from '@/app/(privado)/projects/[id]/document-actions';
import { DOCUMENT_INITIAL_STATE } from '@/lib/projects/action-state';
import { type WorkspaceDocumentRef, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect } from 'react';

const ICONO_DOC = 'M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M9 13h6M9 17h6';

/**
 * Los documentos del espacio, en la misma tira que los tableros
 * (`docs/PLAN-DOCUMENTOS.md`, D5). Se distinguen por el icono, no por un
 * separador: son hermanos del tablero, no otra sección.
 *
 * El «+» crea «Sin título» y lo abre directamente, como Notion. Pedir el
 * nombre antes es un paso de más para algo que se renombra escribiendo encima.
 */
export function DocumentTabs({
  documentos,
  activeId,
  onAbrir,
  projectId,
  workspaceId,
  canEdit,
}: {
  documentos: WorkspaceDocumentRef[];
  activeId: string | null;
  onAbrir: (id: string) => void;
  projectId: string;
  workspaceId: string;
  canEdit: boolean;
}) {
  const [estado, crear, creando] = useAccion(createDocumentAction, DOCUMENT_INITIAL_STATE);

  /* El id llega con la respuesta, y la revalidación de la misma respuesta ya
     trae la pestaña: se abre en cuanto existe. */
  useEffect(() => {
    if (estado.done) onAbrir(estado.done);
  }, [estado.done, onAbrir]);

  if (documentos.length === 0 && !canEdit) return null;

  return (
    <div
      role="tablist"
      aria-label="Documentos del espacio"
      className="scrollbar-none flex min-w-0 shrink items-center gap-0.5 overflow-x-auto"
    >
      {documentos.map((doc) => {
        const activo = doc.id === activeId;
        return (
          <button
            key={doc.id}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onAbrir(doc.id)}
            title={doc.title}
            className={[
              'flex max-w-[11rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1',
              'font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              activo
                ? 'font-semibold text-text-primary'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
            ].join(' ')}
            style={activo ? { background: alpha(colors.primary, 12) } : undefined}
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={ICONO_DOC} />
            </svg>
            <span className="truncate">{doc.title}</span>
          </button>
        );
      })}

      {canEdit && (
        <button
          type="button"
          disabled={creando}
          onClick={() => {
            const datos = new FormData();
            datos.set('projectId', projectId);
            datos.set('workspaceId', workspaceId);
            crear(datos);
          }}
          aria-label="Nuevo documento"
          title={estado.error ?? 'Nuevo documento'}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={estado.error ? { color: colors.error } : undefined}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONO_DOC} />
          </svg>
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
          </svg>
        </button>
      )}
    </div>
  );
}
