'use client';

import {
  deleteAttachmentAction,
  uploadAttachmentAction,
} from '@/app/(privado)/projects/[id]/actions';
import {
  addTaskLinkAction,
  deleteTaskLinkAction,
} from '@/app/(privado)/projects/[id]/link-actions';
import { TASK_INITIAL_STATE } from '@/lib/projects/action-state';
import { validateAttachment } from '@/lib/projects/validation';
import {
  ATTACHMENT_ALLOWED_MIME,
  ATTACHMENT_MAX_BYTES,
  type TaskAttachment,
  type TaskLink,
  type UserProfile,
  alpha,
  colors,
  formatBytes,
  isPreviewableImage,
  isViewablePdf,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { Link2, Paperclip, X } from 'lucide-react';
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
  /** Enlaces adjuntos (un Google Doc, un PR). */
  links: TaskLink[];
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
  links,
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
  /** Qué formulario está abierto: ninguno, subir un PDF o añadir un enlace. */
  const [modo, setModo] = useState<'nada' | 'pdf' | 'enlace'>('nada');
  const cantidad = attachments.length + links.length;

  /* Al confirmar la subida, se pliega: ya está en la lista. */
  useEffect(() => {
    if (state.done) setModo('nada');
  }, [state]);

  return (
    <section className={SECTION_CLASS}>
      <header className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <h4 className={SECTION_TITLE_CLASS}>
          Archivos
          {cantidad > 0 && (
            <span className={SECTION_COUNT_CLASS}>
              {cantidad}
              {attachments.length > 0 && ` · ${formatBytes(total)}`}
            </span>
          )}
        </h4>
        {canUpload && modo === 'nada' && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setModo('pdf')}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-white/[0.07] hover:text-text-primary"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Adjuntar PDF
            </button>
            <button
              type="button"
              onClick={() => setModo('enlace')}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-white/[0.07] hover:text-text-primary"
            >
              <Link2 className="h-3.5 w-3.5" />
              Adjuntar enlace
            </button>
          </span>
        )}
      </header>

      <div className={SECTION_BODY_CLASS}>
        {/* El aviso de para qué sirve, como en Documentos: una sección vacía
            sin una frase se lee como algo que no funciona. */}
        {cantidad === 0 && modo === 'nada' && (
          <p className="font-sans text-xs text-text-secondary">
            {canUpload
              ? `Adjunta PDFs (hasta ${formatBytes(ATTACHMENT_MAX_BYTES)}) o enlaces a un Google Doc, un Figma o un PR: lo que haga falta tener a mano para esta tarea.`
              : 'Esta tarea no tiene archivos ni enlaces.'}
          </p>
        )}

        {links.length > 0 && (
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                addedBy={usersById.get(link.addedBy)}
                projectId={projectId}
                taskId={taskId}
                canDelete={canUpload && (link.addedBy === currentUserId || canModerate)}
              />
            ))}
          </ul>
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

        {canUpload && modo === 'enlace' && (
          <NewLinkForm projectId={projectId} taskId={taskId} onDone={() => setModo('nada')} />
        )}

        {canUpload && modo === 'pdf' && (
          <form
            ref={formRef}
            action={formAction}
            className="flex animate-desplegar-menu flex-wrap items-center gap-2 origin-top"
            noValidate
          >
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
              className="min-w-0 flex-1 cursor-pointer font-sans text-xs text-text-secondary file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:font-sans file:text-xs file:font-semibold file:text-text-primary"
            />
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setRechazo(null);
                  setModo('nada');
                }}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs text-text-secondary hover:text-text-primary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploading || rechazo !== null}
                className="cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: alpha(colors.primary, 20) }}
              >
                {uploading ? 'Subiendo…' : 'Subir PDF'}
              </button>
            </span>
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

/** Un enlace adjunto: título (o dominio), el dominio debajo y quitarlo. */
function LinkRow({
  link,
  addedBy,
  projectId,
  taskId,
  canDelete,
}: {
  link: TaskLink;
  addedBy: UserProfile | undefined;
  projectId: string;
  taskId: string;
  canDelete: boolean;
}) {
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dominio = dominioDe(link.url);

  return (
    <li className="flex items-center gap-3 rounded-xl p-2.5" style={SECTION_PANEL}>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="group flex min-w-0 flex-1 items-center gap-3"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-secondary"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <Link2 className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span
            className="truncate font-sans text-xs text-text-primary group-hover:underline"
            title={link.title ?? link.url}
          >
            {link.title ?? dominio}
          </span>
          <span className="truncate font-sans text-[11px] text-text-secondary">
            {dominio}
            {addedBy && ` · ${personLabel(addedBy)}`}
          </span>
        </span>
      </a>

      {canDelete && (
        <button
          type="button"
          disabled={quitando}
          aria-label={`Quitar el enlace ${link.title ?? dominio}`}
          title="Quitar"
          onClick={async () => {
            setQuitando(true);
            setError(null);
            const result = await deleteTaskLinkAction({ projectId, taskId, linkId: link.id });
            setQuitando(false);
            if (result.error) setError(result.error);
          }}
          className="shrink-0 cursor-pointer rounded p-1 text-text-secondary transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {error && (
        <span role="alert" className="font-sans text-[11px]" style={{ color: colors.error }}>
          {error}
        </span>
      )}
    </li>
  );
}

/** Añadir un enlace: la URL y, si se quiere, un título. Sin título se lee de la página. */
function NewLinkForm({
  projectId,
  taskId,
  onDone,
}: {
  projectId: string;
  taskId: string;
  onDone: () => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!url.trim()) return setError('Pega el enlace.');
    setGuardando(true);
    setError(null);
    const result = await addTaskLinkAction({ projectId, taskId, url, title });
    setGuardando(false);
    if (result.error) return setError(result.error);
    onDone();
  }

  const campo =
    'h-9 w-full min-w-0 rounded-xl border border-white/[0.11] bg-white/[0.05] px-3 font-sans text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary hover:border-white/[0.2] focus:border-primary/70 focus:bg-white/[0.07]';

  return (
    <div
      className="flex origin-top animate-desplegar-menu flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void guardar();
        }
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation();
          onDone();
        }
      }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: se abre para pegar el enlace
        autoFocus
        type="url"
        inputMode="url"
        aria-label="Enlace"
        placeholder="https://docs.google.com/…"
        value={url}
        maxLength={2048}
        onChange={(event) => setUrl(event.target.value)}
        className={campo}
      />
      <input
        aria-label="Título del enlace (opcional)"
        placeholder="Título (opcional: si no, se lee de la página)"
        value={title}
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        className={campo}
      />
      {error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {error}
        </p>
      )}
      <span className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onDone}
          className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs text-text-secondary hover:text-text-primary"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={() => void guardar()}
          className="cursor-pointer rounded-lg px-3 py-1.5 font-sans text-xs font-semibold text-text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: alpha(colors.primary, 20) }}
        >
          {guardando ? 'Añadiendo…' : 'Añadir enlace'}
        </button>
      </span>
    </div>
  );
}

/** `https://www.figma.com/file/…` → `figma.com`. */
function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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
