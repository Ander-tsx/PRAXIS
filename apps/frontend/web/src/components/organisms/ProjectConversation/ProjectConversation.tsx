'use client';

import { previewDeEnlaceAction } from '@/app/(privado)/chat/actions';
import {
  deleteProjectAttachmentAction,
  deleteProjectMessageAction,
  editProjectAction,
  markProjectReadAction,
  muteProjectAction,
  pinProjectAction,
  reactProjectAction,
  sendProjectMessageAction,
  uploadProjectAttachmentAction,
} from '@/app/(privado)/chat/proyecto-actions';
import {
  type ChatMessagePage,
  ChatPanel,
  AnimatedSearchButton,
  ProjectMonogram,
  type ChatPanelHandle,
  type Directory,
  alpha,
  colors,
} from '@praxis/commons';
import { useMemo, useRef, useState } from 'react';

export interface ProjectConversationProps {
  projectId: string;
  projectName: string;
  /** Para volver al proyecto desde la cabecera. */
  projectSlug: string;
  /** Identidad visual del proyecto, para el monograma de la cabecera. */
  projectIconKey?: string | null;
  projectImageUrl?: string | null;
  projectColor?: string | null;
  page: ChatMessagePage;
  /** Quién es quién, y si se pudo preguntar. Ver `commons/api/directory.ts`. */
  directorio: Directory;
  currentUserId: string;
  /** `canComment`: el mismo permiso que comentar en una tarea. */
  canWrite: boolean;
  /**
   * Cuánta gente del equipo, **sin contarte**.
   *
   * Decide cuándo un mensaje tuyo pasa a «visto por todos». Sale de los
   * miembros del proyecto y no de los acuses de lectura: ahí solo aparece
   * quien ya abrió el chat alguna vez.
   */
  otrosDelEquipo: number;
}

/**
 * El chat del equipo de un proyecto, **en la zona de mensajes**.
 *
 * ## Por qué aquí y no en la pantalla del proyecto
 *
 * Ahí estaba, y era la peor pantalla posible para leer: por encima de la
 * conversación iban el título del proyecto, su descripción, la fecha, los
 * contadores y la fila de pestañas, así que al chat le quedaba un tercio del
 * alto y había que bajar para ver los mensajes. Junto a las conversaciones
 * privadas tiene la pantalla entera, la misma que ellas, y además se cambia de
 * un chat de equipo a uno privado sin salir de la zona — que es como se usa de
 * verdad.
 *
 * En el proyecto queda una muestra de los últimos mensajes con su enlace, que
 * es lo que allí hace falta: enterarte de que hay conversación, no tenerla.
 *
 * Es el **mismo `ChatPanel`** que el chat privado y que el que había en el
 * proyecto: solo cambian las acciones —las de esta zona— y la cabecera.
 */
export function ProjectConversation({
  projectId,
  projectName,
  projectSlug,
  projectIconKey = null,
  projectImageUrl = null,
  projectColor = null,
  page,
  directorio,
  currentUserId,
  canWrite,
  otrosDelEquipo,
}: ProjectConversationProps) {
  /* Estable entre renders: `ChatPanel` tiene `marcarLeido` en las dependencias
     de un efecto, y recreada en cada render marcaría como leído en bucle. */
  const acciones = useMemo(
    () => ({
      enviar: (
        cuerpo: string,
        replyToId: string | null,
        attachmentIds: string[],
        enHilo: boolean,
      ) => sendProjectMessageAction(projectId, cuerpo, replyToId, attachmentIds, enHilo),
      borrar: (messageId: string) => deleteProjectMessageAction(projectId, messageId),
      reaccionar: (messageId: string, emoji: string, on: boolean) =>
        reactProjectAction(projectId, messageId, emoji, on),
      fijar: (messageId: string, on: boolean) => pinProjectAction(projectId, messageId, on),
      editar: (messageId: string, body: string) => editProjectAction(projectId, messageId, body),
      marcarLeido: () => markProjectReadAction(projectId),
      adjuntar: (file: File) => uploadProjectAttachmentAction(projectId, file),
      quitarAdjunto: (attachmentId: string) =>
        deleteProjectAttachmentAction(projectId, attachmentId),
      previewDeLink: previewDeEnlaceAction,
    }),
    [projectId],
  );

  const chatRef = useRef<ChatPanelHandle>(null);

  return (
    <ChatPanel
      ref={chatRef}
      pantallaCompletaEnMovil
      salidaMovil={
        <a
          /* ⚠️ `?lista=1`: sin él, el índice redirige a la última conversación
             —esta— y el enlace de volver no vuelve a ningún sitio. Ver la
             cabecera de `(conversaciones)/page.tsx`. */
          href="/chat?lista=1"
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
          Conversaciones
        </a>
      }
      page={page}
      directorio={directorio}
      currentUserId={currentUserId}
      acciones={acciones}
      gatewayPath="/api/gateway"
      rutaCanal={`/projects/${projectId}/chat`}
      canWrite={canWrite}
      participantes={otrosDelEquipo}
      motivoSinEscribir="Puedes leer la conversación del equipo, pero tu rol no incluye escribir en ella."
      vacio={
        canWrite
          ? 'Todavía no hay mensajes. Escribe el primero.'
          : 'Todavía no hay mensajes en este proyecto.'
      }
      /* Pulsar sobre quien escribió abre la conversación privada con esa
         persona — aquí ya estamos en su zona, así que es una ruta de la misma. */
      hrefDePersona={(userId) => `/chat/${userId}`}
      /* Las menciones sí: en el chat del equipo hay a quién nombrar. */
      permiteMenciones
      encabezado={
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 md:gap-3 md:pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <ProjectMonogram
                id={projectId}
                name={projectName}
                iconKey={projectIconKey}
                imageUrl={projectImageUrl}
                color={projectColor}
                size="sm"
              />
              <h2 className="truncate font-display text-lg text-text-primary md:text-2xl">{projectName}</h2>
            </div>
            <p className="font-sans text-xs text-white">
              Chat del equipo ·{' '}
              {/* ⚠️ `/projects` sigue siendo zona aparte hasta F6: `<a>` duro, no
                  `<Link>`, o el router intentaría resolverla dentro de esta app. */}
              <a
                href={`/projects/${projectSlug}`}
                className="underline underline-offset-2 transition-opacity hover:opacity-80"
              >
                Ir al proyecto
              </a>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <AnimatedSearchButton
              onSearch={(t) => chatRef.current?.buscarLocal(t)}
              onClear={() => chatRef.current?.cerrarBusqueda()}
            />
            <BotonSilenciar projectId={projectId} inicial={page.muted} />
          </div>
        </div>
      }
    />
  );
}

/** Abre la búsqueda de `ChatPanel`, con el mismo estilo que «Silenciar avisos». */

/**
 * ⚠️ El texto dice **«avisos»** y no «notificaciones» a propósito: silenciar
 * apaga la tarjeta y el sonido, pero **el contador sigue**.
 */
function BotonSilenciar({ projectId, inicial }: { projectId: string; inicial: boolean }) {
  const [muted, setMuted] = useState(inicial);
  const [enviando, setEnviando] = useState(false);

  async function alternar() {
    setEnviando(true);
    const confirmado = await muteProjectAction(projectId, !muted);
    /* Se corrige con lo que confirma el servidor, no con lo que se pidió. */
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
        borderColor: colors.border,
        background: muted ? alpha(colors.textSecondary, 10) : 'transparent',
        color: colors.textSecondary,
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
        {muted && <path strokeLinecap="round" d="M4 4l16 16" />}
      </svg>
      {muted ? 'Avisos apagados' : 'Silenciar avisos'}
    </button>
  );
}
