'use client';

import { useRef } from 'react';
import type { ChatAttachment, ChatMessage, UserProfile } from '../../api/domain';
import { colors } from '../../tokens';
import { Composer, type Sugerencia } from './Composer';
import { MessageBubble } from './MessageBubble';

export interface ThreadPanelProps {
  /** El mensaje que abre el hilo. */
  raiz: ChatMessage;
  /** Sus respuestas, en orden, con las correcciones locales ya aplicadas. */
  replies: ChatMessage[];
  /** Verdadero mientras el hilo se está pidiendo por primera vez. */
  cargando: boolean;
  /** Error al cargar el hilo, si lo hubo. */
  error: string | null;
  /** Cierra el panel lateral. */
  onCerrar: () => void;
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  canWrite: boolean;
  canModerate: boolean;
  /** Si `@` ofrece personas en las respuestas del hilo. */
  permiteMenciones: boolean;
  /** Por qué no puedes escribir, si es que no puedes. */
  motivoSinEscribir?: string | null;
  gatewayPath: string;
  rutaCanal: string;
  /** Enviar una respuesta del hilo: el panel del chat fija `replyToId`. */
  onEnviar: (cuerpo: string, attachmentIds: string[]) => void;
  enviando: boolean;
  onReaccionar: (messageId: string, emoji: string, on: boolean) => void;
  onFijar: (messageId: string, on: boolean) => void;
  onEditar: (messageId: string, body: string) => Promise<boolean>;
  onBorrar: (messageId: string) => void;
  /** Los borradores que esperan al envío de la respuesta. */
  adjuntosPendientes: ChatAttachment[];
  onAdjuntar: (file: File) => void;
  onQuitarAdjunto: (attachmentId: string) => void;
  subiendo: boolean;
  /** Para el `@` del redactor: las mismas personas y referencias que el chat. */
  sugerencias: Sugerencia[];
  onPedirSugerencias: () => void;
  hrefDePersona?: (userId: string) => string | null;
  nombreDeAutor: (userId: string) => string;
  previewDeLink?: (url: string) => Promise<import('../../api/link-preview').LinkPreview | null>;
}

/**
 * El hilo de un mensaje, en un panel lateral.
 *
 * ## Qué es un hilo aquí
 *
 * Nada nuevo en la base: un hilo es un mensaje con respuestas, y una respuesta
 * es un mensaje con `replyToId`. Las respuestas fluyen por el historial como los
 * demás mensajes —que es lo que hace que la conversación se lea entera sin
 * abrir nada— y este panel las reúne bajo el mensaje que las provocó.
 *
 * ## Quién lleva el estado
 *
 * Este componente es **tonto a propósito**: las respuestas, sus correcciones
 * locales y los callbacks los trae `ChatPanel`, que ya tiene los mapas de
 * reacciones, fijados y editados de la conversación. Duplicarlos aquí haría que
 * reaccionar en el hilo y verlo en el historial fueran dos cosas distintas.
 */
export function ThreadPanel({
  raiz,
  replies,
  cargando,
  error,
  onCerrar,
  usersById,
  currentUserId,
  canWrite,
  canModerate,
  permiteMenciones,
  motivoSinEscribir,
  gatewayPath,
  rutaCanal,
  onEnviar,
  enviando,
  onReaccionar,
  onFijar,
  onEditar,
  onBorrar,
  adjuntosPendientes,
  onAdjuntar,
  onQuitarAdjunto,
  subiendo,
  sugerencias,
  onPedirSugerencias,
  hrefDePersona,
  nombreDeAutor,
  previewDeLink,
}: ThreadPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bubbles = [raiz, ...replies];

  return (
    <div
      className="flex w-full flex-col border-l border-border max-sm:fixed max-sm:inset-0 max-sm:z-50 sm:w-80 sm:shrink-0"
      style={{ background: colors.background }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h4 className="font-display text-base text-text-primary">Hilo</h4>
          <p className="truncate font-sans text-xs text-text-secondary">
            {cargando
              ? 'Cargando…'
              : replies.length > 0
                ? `${replies.length} ${replies.length === 1 ? 'respuesta' : 'respuestas'}`
                : 'Todavía sin respuestas'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el hilo"
          className="cursor-pointer rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden px-1 py-2"
      >
        {bubbles.map((mensaje, indice) => {
          const anterior = bubbles[indice - 1];
          const continued =
            anterior !== undefined &&
            anterior.authorId === mensaje.authorId &&
            new Date(mensaje.createdAt).getTime() - new Date(anterior.createdAt).getTime() <
              5 * 60_000;
          return (
            <div key={mensaje.id}>
              <MessageBubble
                message={mensaje}
                author={usersById.get(mensaje.authorId)}
                mine={mensaje.authorId === currentUserId}
                continued={continued}
                canDelete={mensaje.authorId === currentUserId || canModerate}
                canReact={canWrite}
                canFijar={canWrite}
                currentUserId={currentUserId}
                hrefDePersona={hrefDePersona ? hrefDePersona(mensaje.authorId) : null}
                hrefDeAdjunto={(id) => `${gatewayPath}${rutaCanal}/attachments/${id}/content`}
                scrollerRef={scrollerRef}
                onResponder={() => undefined}
                onReaccionar={onReaccionar}
                onFijar={onFijar}
                onEditar={onEditar}
                onBorrar={onBorrar}
                onAbrirHilo={() => undefined}
                mostrarMarcaDeHilo={false}
                nombreDeAutor={nombreDeAutor}
                {...(previewDeLink ? { previewDeLink } : {})}
              />{' '}
            </div>
          );
        })}
        {error && (
          <p className="px-2 font-sans text-xs" style={{ color: colors.error }}>
            {error}
          </p>
        )}
      </div>

      {canWrite ? (
        <div className="shrink-0 border-t border-border p-3">
          <Composer
            onEnviar={onEnviar}
            enviando={enviando}
            placeholder="Responder en el hilo…"
            permiteMenciones={permiteMenciones}
            sugerencias={sugerencias}
            onPedirSugerencias={onPedirSugerencias}
            adjuntosPendientes={adjuntosPendientes}
            onAdjuntar={onAdjuntar}
            onQuitarAdjunto={onQuitarAdjunto}
            subiendo={subiendo}
          />
        </div>
      ) : (
        <p className="shrink-0 border-t border-border px-4 py-3 font-sans text-xs text-text-secondary">
          {motivoSinEscribir ?? 'Puedes leer el hilo, pero no escribir en él.'}
        </p>
      )}
    </div>
  );
}
