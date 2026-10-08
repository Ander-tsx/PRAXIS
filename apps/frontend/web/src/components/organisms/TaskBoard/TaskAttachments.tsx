'use client';

import {
  deleteAttachmentAction,
  uploadAttachmentAction,
} from '@/app/(privado)/projects/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import { validateAttachment } from '@/lib/projects/validation';
import {
  ATTACHMENT_ALLOWED_MIME,
  ATTACHMENT_MAX_BYTES,
  type TaskAttachment,
  type UserProfile,
  alpha,
  colors,
  formatBytes,
  isPreviewableImage,
  isViewablePdf,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { useEffect, useRef, useState } from 'react';
import { PdfViewer } from './PdfViewer';
import {
  SECTION_BODY_CLASS,
  SECTION_CLASS,
  SECTION_COUNT_CLASS,
  SECTION_PANEL,
  SECTION_TITLE_CLASS,
} from './section-panel';

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
 * ⚠️ **La descarga apunta al proxy de la aplicación, no al gateway.** El gateway
 * está en otro puerto y la sesión vive en una cookie httpOnly del origen de la
 * aplicación: un enlace directo a `:3000` iría sin credenciales y devolvería
 * 401. `/api/gateway/...` es el mismo origen, así que la cookie viaja sola y el
 * proxy pone la cabecera de autorización.
 *
 * 🔴 **Era `/projects/api/gateway/...` y daba 404 desde la fusión de zonas.**
 * Ese prefijo existía porque projects-front tenía `basePath: '/projects'` y Next
 * se lo anteponía solo; fusionado (F6), el proxy es uno y vive en
 * `/api/gateway`. La ruta vieja no da un error legible: `/projects/...` sigue
 * casando con el segmento dinámico `[id]` del proyecto, así que el navegador
 * recibe **la pantalla de un proyecto que no existe** —un 404 de Next, en HTML—
 * donde esperaba un PDF. De ahí que el marco del visor saliera en blanco y la
 * descarga guardara un archivo roto, sin un solo error en la consola.
 * Es la misma trampa que `projectPath()`, anotada en CLAUDE.md.
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
  const [state, formAction, uploading] = useAccion(uploadAttachmentAction, TASK_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  /**
   * Lo que el navegador rechaza sin llegar a enviar.
   *
   * ⚠️ **Aquí no había validación de cliente, y es la regla del repositorio.**
   * `validateAttachment` solo corría dentro de la Server Action, así que elegir
   * un archivo de 40 MB significaba subirlo entero para que lo rechazaran al
   * otro lado. Ahora el mensaje sale al elegirlo y señala el campo, que es el
   * motivo por el que la regla existe.
   */
  const [rechazo, setRechazo] = useState<string | null>(null);

  /** Se limpia al confirmar el servidor, para poder subir otro seguido. */
  useEffect(() => {
    if (state.done) formRef.current?.reset();
  }, [state]);

  const total = attachments.reduce((sum, file) => sum + file.size, 0);

  return (
    <section className={SECTION_CLASS}>
      <h4 className={`${SECTION_TITLE_CLASS} px-1`}>
        Archivos{' '}
        {attachments.length > 0 && (
          <span className={SECTION_COUNT_CLASS}>
            {attachments.length} · {formatBytes(total)}
          </span>
        )}
      </h4>

      <div className={SECTION_BODY_CLASS}>
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
              onChange={(evento) => {
                const elegido = evento.target.files?.[0];
                setRechazo(elegido ? validateAttachment(elegido.type, elegido.size) : null);
              }}
              className="flex-1 cursor-pointer font-sans text-xs text-white file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:font-sans file:text-xs file:font-semibold file:text-white"
            />
            <button
              type="submit"
              disabled={uploading || rechazo !== null}
              className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: alpha(colors.primary, 20) }}
            >
              {uploading ? 'Subiendo…' : 'Adjuntar'}
            </button>
          </form>
        )}

        {/* El del navegador manda sobre el del servidor: si el archivo ni siquiera
          se puede enviar, lo que diga el intento anterior ya no viene al caso. */}
        {(rechazo ?? state.error) && (
          <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
            {rechazo ?? state.error}
          </p>
        )}
      </div>
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
  const [state, deleteAction, deleting] = useAccion(deleteAttachmentAction, TASK_INITIAL_STATE);

  /** Mismo origen que la aplicación: la cookie de sesión viaja sola. */
  const href = `/api/gateway/tasks/${taskId}/attachments/${file.id}/content`;
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
            style={{ background: 'rgba(255,255,255,0.08)' }}
          />
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-sans text-[10px] font-semibold uppercase text-white"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            {extension(file.filename)}
          </span>
        )}

        <span className="flex min-w-0 flex-col">
          <span className="truncate font-sans text-xs text-white" title={file.filename}>
            {file.filename}
          </span>
          <span className="font-sans text-[11px] text-white">
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
            className="cursor-pointer rounded p-1 text-white transition-colors hover:text-error disabled:cursor-not-allowed"
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
