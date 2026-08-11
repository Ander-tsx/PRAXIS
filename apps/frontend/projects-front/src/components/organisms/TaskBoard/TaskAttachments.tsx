'use client';

import {
  ATTACHMENT_ALLOWED_MIME,
  isViewablePdf,
  ATTACHMENT_MAX_BYTES,
  type TaskAttachment,
  type UserProfile,
  alpha,
  colors,
  formatBytes,
  isPreviewableImage,
  personLabel,
} from '@praxis/commons';
import { useActionState, useEffect, useRef } from 'react';
import { deleteAttachmentAction, uploadAttachmentAction } from '@/app/(private)/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/action-state';
import { PdfViewer } from './PdfViewer';
import { SECTION_PANEL } from './section-panel';

export interface TaskAttachmentsProps {
  projectId: string;
  taskId: string;
  attachments: TaskAttachment[];
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  canUpload: boolean;
  canModerate: boolean;
}

/**
 * Archivos adjuntos de una tarea.
 *
 * ⚠️ **La descarga apunta al proxy de la zona, no al gateway.** El gateway está
 * en otro puerto y la sesión vive en una cookie httpOnly del origen de la
 * aplicación: un enlace directo a `:3000` iría sin credenciales y devolvería
 * 401. `/projects/api/gateway/...` es el mismo origen, así que la cookie viaja
 * sola y el proxy pone la cabecera de autorización.
 */
export function TaskAttachments({
  projectId,
  taskId,
  attachments,
  usersById,
  currentUserId,
  canUpload,
  canModerate,
}: TaskAttachmentsProps) {
  const [state, formAction, uploading] = useActionState(uploadAttachmentAction, TASK_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  /** Se limpia al confirmar el servidor, para poder subir otro seguido. */
  useEffect(() => {
    if (state.done) formRef.current?.reset();
  }, [state]);

  const total = attachments.reduce((sum, file) => sum + file.size, 0);

  return (
    <section className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
      <h4 className="font-sans text-sm font-medium text-text-primary">
        Archivos{' '}
        {attachments.length > 0 && (
          <span className="font-normal text-text-secondary">
            {attachments.length} · {formatBytes(total)}
          </span>
        )}
      </h4>

      {attachments.length === 0 && (
        <p className="font-sans text-xs text-text-secondary">
          {canUpload
            ? `Solo PDF, hasta ${formatBytes(ATTACHMENT_MAX_BYTES)} cada uno.`
            : 'Esta tarea no tiene archivos.'}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attachments.map((file) => (
            <AttachmentRow
              key={file.id}
              file={file}
              uploader={usersById.get(file.uploadedBy)}
              projectId={projectId}
              taskId={taskId}
              canDelete={file.uploadedBy === currentUserId || canModerate}
            />
          ))}
        </ul>
      )}

      {canUpload && (
        <form ref={formRef} action={formAction} className="flex items-center gap-2" noValidate>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input
            type="file"
            name="file"
            /* Filtra el diálogo del sistema. No sustituye a la validación: el
               `accept` se puede saltar eligiendo «todos los archivos». */
            accept={ATTACHMENT_ALLOWED_MIME.join(',')}
            aria-label="Archivo que adjuntar"
            className="flex-1 cursor-pointer font-sans text-xs text-text-secondary file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface-elevated file:px-3 file:py-1.5 file:font-sans file:text-xs file:font-semibold file:text-text-primary"
          />
          <button
            type="submit"
            disabled={uploading}
            className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: alpha(colors.primary, 20) }}
          >
            {uploading ? 'Subiendo…' : 'Adjuntar'}
          </button>
        </form>
      )}

      {state.error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {state.error}
        </p>
      )}
    </section>
  );
}

function AttachmentRow({
  file,
  uploader,
  projectId,
  taskId,
  canDelete,
}: {
  file: TaskAttachment;
  uploader: UserProfile | undefined;
  projectId: string;
  taskId: string;
  canDelete: boolean;
}) {
  const [state, deleteAction, deleting] = useActionState(
    deleteAttachmentAction,
    TASK_INITIAL_STATE,
  );

  /** Mismo origen que la aplicación: la cookie de sesión viaja sola. */
  const href = `/projects/api/gateway/tasks/${taskId}/attachments/${file.id}/content`;
  const preview = isPreviewableImage(file.mimeType);
  /* Solo PDF desde que la subida se cerró a ese tipo. Sigue comprobándose por
     archivo porque los adjuntos de antes conservan el suyo. */
  const verEnPagina = isViewablePdf(file.mimeType);

  return (
    <li className="flex items-center gap-3 rounded-xl p-2.5" style={SECTION_PANEL}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {preview ? (
          // biome-ignore lint/performance/noImgElement: es contenido subido por el usuario y servido por el proxy, no un asset del build
          <img
            src={href}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
            style={{ background: alpha(colors.border, 40) }}
          />
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-sans text-[10px] font-semibold uppercase text-text-secondary"
            style={{ background: alpha(colors.border, 40) }}
          >
            {extension(file.filename)}
          </span>
        )}

        <span className="flex min-w-0 flex-col">
          <span className="truncate font-sans text-xs text-text-primary" title={file.filename}>
            {file.filename}
          </span>
          <span className="font-sans text-[11px] text-text-disabled">
            {formatBytes(file.size)}
            {uploader && ` · ${personLabel(uploader)}`}
          </span>
        </span>
      </a>

      {verEnPagina && <PdfViewer href={href} filename={file.filename} />}

      {canDelete && (
        <form action={deleteAction} className="shrink-0">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="attachmentId" value={file.id} />
          <button
            type="submit"
            disabled={deleting}
            aria-label={`Eliminar ${file.filename}`}
            title="Eliminar"
            className="cursor-pointer rounded p-1 text-text-disabled transition-colors hover:text-error disabled:cursor-not-allowed"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </form>
      )}

      {state.error && (
        <span role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
          {state.error}
        </span>
      )}
    </li>
  );
}

/** `informe-final.pdf` → `PDF`. Para el icono de los que no son imagen. */
function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1 || dot === filename.length - 1) return 'FILE';
  return filename.slice(dot + 1, dot + 5);
}
