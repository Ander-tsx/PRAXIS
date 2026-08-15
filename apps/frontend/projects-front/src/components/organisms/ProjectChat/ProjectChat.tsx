'use client';

import {
  deleteChatAttachmentAction,
  deleteChatMessageAction,
  editChatMessageAction,
  markChatReadAction,
  muteChatAction,
  pinChatMessageAction,
  previewDeEnlaceAction,
  reactChatAction,
  sendChatMessageAction,
  uploadChatAttachmentAction,
} from '@/app/(private)/[id]/actions';
import {
  type ChatMessagePage,
  ChatPanel,
  type ChatPanelHandle,
  type UserProfile,
  alpha,
  colors,
} from '@praxis/commons';
import { useMemo, useRef, useState } from 'react';

export interface ProjectChatProps {
  projectId: string;
  projectName: string;
  /** La última página, ya pedida en el servidor. Del más antiguo al más nuevo. */
  page: ChatMessagePage;
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  /** `canComment`: el mismo permiso que comentar en una tarea. */
  canWrite: boolean;
  /** `canManageMembers`: quien lleva el equipo retira mensajes ajenos. */
  canModerate: boolean;
  /**
   * A dónde vuelve el botón de salir en móvil.
   *
   * Lo da la page porque es quien conoce el slug: la URL del proyecto lo lleva
   * y este componente solo tiene el UUID, que daría una dirección fea y un
   * redirección de más.
   */
  hrefVolver: string;
}

/**
 * El chat del equipo de un proyecto.
 *
 * Es un envoltorio fino sobre `ChatPanel`: lo único que aporta es el encabezado
 * y atar las acciones de esta zona. Todo el comportamiento —historial, envío,
 * respuestas, reacciones, menciones— es **el mismo código** que la conversación
 * privada, y esa es la razón de que el panel viva en `commons`. Cuando esto eran
 * dos componentes, cualquier arreglo había que aplicarlo dos veces.
 */
export function ProjectChat({
  projectId,
  projectName,
  page,
  usersById,
  currentUserId,
  canWrite,
  canModerate,
  hrefVolver,
}: ProjectChatProps) {
  /* Estable entre renders: `ChatPanel` tiene `marcarLeido` en las dependencias
     de un efecto, y recreada en cada render marcaría como leído en bucle. */
  const acciones = useMemo(
    () => ({
      enviar: (
        cuerpo: string,
        replyToId: string | null,
        attachmentIds: string[],
        enHilo: boolean,
      ) => sendChatMessageAction(projectId, cuerpo, replyToId, attachmentIds, enHilo),
      borrar: (messageId: string) => deleteChatMessageAction(projectId, messageId),
      reaccionar: (messageId: string, emoji: string, on: boolean) =>
        reactChatAction(projectId, messageId, emoji, on),
      fijar: (messageId: string, on: boolean) => pinChatMessageAction(projectId, messageId, on),
      editar: (messageId: string, body: string) =>
        editChatMessageAction(projectId, messageId, body),
      marcarLeido: () => markChatReadAction(projectId),
      adjuntar: (file: File) => uploadChatAttachmentAction(projectId, file),
      quitarAdjunto: (attachmentId: string) => deleteChatAttachmentAction(projectId, attachmentId),
      previewDeLink: previewDeEnlaceAction,
    }),
    [projectId],
  );

  const chatRef = useRef<ChatPanelHandle>(null);

  return (
    <ChatPanel
      ref={chatRef}
      /* En móvil se lleva la pantalla entera: dentro de una pestaña, con la
         cabecera del proyecto y la lista de pestañas encima, la conversación
         quedaba en una franja donde no se puede ni leer ni escribir. */
      pantallaCompletaEnMovil
      salidaMovil={
        <a
          href={hrefVolver}
          className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1.5 font-sans text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver al proyecto
        </a>
      }
      page={page}
      usersById={usersById}
      currentUserId={currentUserId}
      acciones={acciones}
      gatewayPath="/projects/api/gateway"
      rutaCanal={`/projects/${projectId}/chat`}
      canWrite={canWrite}
      canModerate={canModerate}
      motivoSinEscribir="Puedes leer la conversación del equipo, pero tu rol no incluye escribir en ella."
      vacio={
        canWrite
          ? 'Todavía no hay mensajes. Escribe el primero.'
          : 'Todavía no hay mensajes en este proyecto.'
      }
      /**
       * Pulsar sobre quien escribió abre la conversación privada con esa
       * persona. ⚠️ Cruza de zona —el chat privado vive en `dashboard`— así que
       * la ruta lleva el prefijo completo y `ChatPanel` navega con un `<a>` duro.
       */
      hrefDePersona={(userId) => `/dashboard/chat/${userId}`}
      /* Las menciones sí: en el chat del equipo hay a quién nombrar. */
      permiteMenciones
      encabezado={
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="font-display text-2xl text-text-primary">Chat del equipo</h3>
            <p className="font-sans text-sm text-text-secondary">
              Lo que se escriba aquí lo ve todo el equipo de {projectName}.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <BotonBuscar onClick={() => chatRef.current?.abrirBusqueda()} />
            <BotonSilenciar projectId={projectId} inicial={page.muted} />
          </div>
        </div>
      }
    />
  );
}

/**
 * Abre la búsqueda de `ChatPanel`, con el mismo estilo que «Silenciar avisos».
 *
 * Vive en la cabecera —fuera del árbol del panel— porque es donde debe estar
 * junto a los demás controles del chat; la llamada real va por
 * `ChatPanelHandle`, que el panel expone justo para esto.
 */
function BotonBuscar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Buscar en el chat"
      title="Buscar en el chat"
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-sans text-xs transition-colors"
      style={{ borderColor: colors.border, color: colors.textSecondary }}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
        />
      </svg>
    </button>
  );
}

/**
 * ⚠️ El texto dice **«avisos»** y no «notificaciones» a propósito: silenciar
 * apaga la tarjeta y el sonido, pero **el contador de la pestaña sigue**. Un
 * botón que dijera «silenciar el chat» prometería no volver a saber nada de él,
 * que no es lo que hace.
 */
function BotonSilenciar({ projectId, inicial }: { projectId: string; inicial: boolean }) {
  const [muted, setMuted] = useState(inicial);
  const [enviando, setEnviando] = useState(false);

  async function alternar() {
    setEnviando(true);
    const confirmado = await muteChatAction(projectId, !muted);
    /* Se corrige con lo que confirma el servidor, no con lo que se pidió: si
       falla, el interruptor vuelve a la verdad en vez de enseñar la intención. */
    if (confirmado) setMuted(confirmado.muted);
    setEnviando(false);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={enviando}
      aria-pressed={muted}
      title={
        muted
          ? 'Los avisos de este chat están apagados. Los mensajes sin leer se siguen contando.'
          : 'Apagar la tarjeta y el sonido de este chat. Los mensajes sin leer se siguen contando.'
      }
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-sans text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: muted ? colors.border : colors.border,
        background: muted ? alpha(colors.textSecondary, 10) : 'transparent',
        color: muted ? colors.textSecondary : colors.textSecondary,
      }}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
        />
        {/* La barra que tacha la campana solo cuando está silenciado: es la
            diferencia que se lee de un vistazo, sin leer el texto. */}
        {muted && <path strokeLinecap="round" d="M4 4l16 16" />}
      </svg>
      {muted ? 'Avisos apagados' : 'Silenciar avisos'}
    </button>
  );
}
