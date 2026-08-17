'use client';

import { useRef, useState } from 'react';
import type { Directorio } from '../../api/directorio';
import type { ChatAttachment, ChatMessage } from '../../api/domain';
import { colors } from '../../tokens';
import { useSidebarPlegada } from '../AppLayout/AppShell';
import { Composer, type Sugerencia } from './Composer';
import { MessageBubble } from './MessageBubble';
import { campoDesdeCuerpo } from './etiquetado';

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
  /** Quién es quién, y si se pudo preguntar. Ver `commons/api/directorio.ts`. */
  directorio: Directorio;
  currentUserId: string;
  canWrite: boolean;
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
  isProjectChat?: boolean;
}

/**
 * El hilo de un mensaje, en un panel lateral.
 *
 * ## Qué es un hilo aquí
 *
 * Un subchat: lo que se escribe en su compositor (`onEnviar`, más abajo) se
 * guarda con `enHilo: true` y **no fluye por la conversación general** — vive
 * aquí y solo aquí. Es lo que lo distingue de «responder» desde el
 * compositor principal, que cita igual (`replyToId`) pero sí fluye fuera.
 * Este panel reúne bajo el mensaje que abrió el hilo tanto sus respuestas
 * dedicadas como las citas que recibió desde fuera — las dos comparten
 * `replyToId`, así que las dos aparecen aquí.
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
  directorio,
  currentUserId,
  canWrite,
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
  isProjectChat = false,
}: ThreadPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bubbles = [raiz, ...replies];
  /**
   * El mensaje que se edita **en el compositor de este panel**.
   *
   * Estado propio y no del chat: editar aquí tiene que rellenar el campo de
   * «Responder en el hilo…», no el de abajo del historial, que ni siquiera se
   * está mirando. Es la misma idea que en `ChatPanel`, aplicada al subchat.
   */
  const [editando, setEditando] = useState<ChatMessage | null>(null);

  async function guardarEdicion(cuerpo: string) {
    if (!editando) return;
    const guardado = await onEditar(editando.id, cuerpo);
    if (guardado) setEditando(null);
  }
  /* Mismo motivo que el ancho máximo de AppHeader: plegar la barra lateral
     libera sitio que un panel de ancho fijo nunca reclamaba. */
  const plegada = useSidebarPlegada();

  return (
    <div
      /* `min-h-0`: sin él, este panel es un hijo `flex` cuya altura mínima por
         defecto es la de su contenido —no la fila que lo contiene—, así que
         crece con cada respuesta en vez de quedarse dentro del alto del chat y
         dejar que el scroller de abajo se encargue. Mismo motivo que el `min-h-0`
         del contenedor del chat principal, ver el comentario en `ChatPanel`. */
      className={`flex min-h-0 w-full flex-col border-l border-border max-md:fixed max-md:inset-0 max-md:z-50 md:shrink-0 ${
        plegada ? 'md:w-96' : 'md:w-80'
      }`}
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
        /**
         * El hilo mide **lo mismo que el chat** porque los dos son hijos
         * estirados de la misma fila y ninguno lleva tope propio: el alto lo
         * fija el contenedor de la pantalla, una sola vez. Cuando cada uno
         * tenía su `max-h`, terminaban a alturas distintas y crecían con cada
         * mensaje — ver el comentario del scroller en `ChatPanel`.
         */
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
                author={directorio.perfiles.get(mensaje.authorId)}
                /* Sin marca de «visto» dentro del hilo: los acuses se guardan
                   por canal y no por mensaje, así que aquí no hay forma de saber
                   si alguien ha leído **esta respuesta**. Ver `mostrarVisto`. */
                mostrarVisto={false}
                mine={mensaje.authorId === currentUserId}
                continued={continued}
                canDelete={mensaje.authorId === currentUserId}
                canReact={canWrite}
                /**
                 * ⚠️ **Sin fijar dentro del hilo.** La barra de fijados solo
                 * recorre los mensajes de la conversación general, así que
                 * fijar una respuesta de hilo guardaba la marca y no la
                 * enseñaba en ninguna parte: el botón se encendía y no pasaba
                 * nada más. Lo que se fija es el mensaje que abre el hilo, y
                 * ese sí tiene su botón en el historial.
                 */
                canFijar={false}
                currentUserId={currentUserId}
                hrefDePersona={hrefDePersona ? hrefDePersona(mensaje.authorId) : null}
                hrefDeAdjunto={(id) => `${gatewayPath}${rutaCanal}/attachments/${id}/content`}
                gatewayPath={gatewayPath}
                scrollerRef={scrollerRef}
                permiteMenciones={permiteMenciones}
                sugerencias={sugerencias}
                onPedirSugerencias={onPedirSugerencias}
                onResponder={() => undefined}
                onReaccionar={onReaccionar}
                onFijar={onFijar}
                onPedirEdicion={setEditando}
                editandose={editando?.id === mensaje.id}
                onBorrar={onBorrar}
                onAbrirHilo={() => undefined}
                permiteAbrirHilo={false}
                /* Ver el aviso de `permiteResponder` en `MessageBubble`: una
                   respuesta a otra respuesta se quedaba sin sitio donde
                   aparecer. Necesita `threadRootId` en el backend. */
                permiteResponder={false}
                mostrarMarcaDeHilo={false}
                /* Todo mensaje de aquí responde a `raiz` — es lo que significa
                   estar en su hilo—, así que su cita repetiría, mensaje tras
                   mensaje, algo que la cabecera del panel ya dice una vez. Si
                   `raiz` a su vez cita a un tercero, esa cita sí es información
                   nueva y se mantiene. */
                ocultarCitaSiApuntaA={raiz.id}
                nombreDeAutor={nombreDeAutor}
                isProjectChat={isProjectChat}
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
            /* Ver el aviso de la `key` en `ChatPanel`: es lo que rellena el
               campo con el mensaje que se va a editar. */
            key={editando ? `editar-${editando.id}` : 'nuevo'}
            onEnviar={editando ? (cuerpo) => void guardarEdicion(cuerpo) : onEnviar}
            enviando={enviando}
            placeholder={editando ? 'Edita tu mensaje…' : 'Responder en el hilo…'}
            permiteMenciones={permiteMenciones}
            sugerencias={sugerencias}
            onPedirSugerencias={onPedirSugerencias}
            adjuntosPendientes={editando ? [] : adjuntosPendientes}
            onAdjuntar={onAdjuntar}
            onQuitarAdjunto={onQuitarAdjunto}
            subiendo={subiendo}
            {...(editando
              ? {
                  valorInicial: campoDesdeCuerpo(editando.body),
                  onCancelar: () => setEditando(null),
                  etiquetaEnviar: 'Guardar',
                  ocultarAdjuntos: true,
                  autoFoco: true,
                }
              : {})}
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
