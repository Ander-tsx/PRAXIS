'use client';

import {
  deleteDirectAttachmentAction,
  deleteDirectChatAction,
  deleteDirectMessageAction,
  editDirectAction,
  markDirectReadAction,
  muteDirectAction,
  pinDirectAction,
  previewDeEnlaceAction,
  reactDirectAction,
  sendDirectMessageAction,
  uploadDirectAttachmentAction,
} from '@/app/(privado)/chat/actions';
import {
  Avatar,
  Badge,
  type ChatMessagePage,
  ChatPanel,
  AnimatedSearchButton,
  type ChatPanelHandle,
  type Directory,
  type UserProfile,
  colors,
} from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

export interface DirectConversationProps {
  peerId: string;
  peerNombre: string;
  /**
   * Dónde coincidís y qué es esa persona allí.
   *
   * ⚠️ **Es decoración del encabezado, no un permiso.** Vacío significa «estáis
   * en la misma organización pero todavía no compartís tablero», que desde la
   * etapa de la organización activa es un estado normal y no una negativa. Ver
   * `canWrite`.
   */
  proyectosEnComun: { id: string; name: string; slug: string; rol: string }[];
  page: ChatMessagePage;
  /** Quién es quién, y si se pudo preguntar. Ver `commons/api/directory.ts`. */
  directorio: Directory;
  currentUserId: string;
  /**
   * Si el compositor está abierto.
   *
   * ## 🔴 Lo decide la página, y lo decide preguntándoselo al servidor
   *
   * Se calculaba aquí como `proyectosEnComun.length > 0 || isAdmin ||
   * page.items.length > 0`, que era **la regla de antes del 2026-08-28**: la
   * puerta del chat privado pasó de «compartís proyecto» a «compartís
   * organización» (D5/B7 de `PLAN-ORGANIZACION-ACTIVA`) y esto se quedó atrás.
   *
   * El efecto era el peor posible: la conversación abría —el gateway sí
   * dejaba— y el compositor salía apagado, sin decir por qué, con alguien de tu
   * propio equipo al otro lado.
   *
   * Ahora lo trae la página, que es quien sabe si `GET
   * /me/chats/:peerId/messages` respondió. Si respondió, puedes escribir: el
   * gateway ya aplicó `puedeHablarCon`, y repetir esa decisión en el navegador
   * es exactamente lo que la desincronizó.
   */
  canWrite: boolean;
  /**
   * Si quien mira administra la plataforma.
   *
   * ⚠️ **Ya no decide si se puede escribir** —eso es `canWrite`—: solo cambia la
   * frase del encabezado cuando no hay proyectos en común, porque «puedes
   * hablarle porque administras» y «puedes hablarle porque sois del mismo
   * equipo» son dos motivos distintos y conviene decir cuál es.
   */
  isAdmin?: boolean;
}

/**
 * La conversación con una persona.
 *
 * Es un envoltorio fino sobre `ChatPanel`: lo único que aporta es **el
 * encabezado con la jerarquía** y atar las acciones de esta zona. Todo el
 * comportamiento del chat —historial, envío, borrado, desplazamiento— es el
 * mismo código que el chat de proyecto, y esa es justo la razón de que el panel
 * viva en `commons`.
 */
export function DirectConversation({
  peerId,
  peerNombre,
  proyectosEnComun,
  page,
  directorio,
  currentUserId,
  canWrite,
  isAdmin = false,
}: DirectConversationProps) {
  /* `useCallback` porque `ChatPanel` las tiene en las dependencias de un efecto:
     recreadas en cada render, marcaría como leído en bucle. */
  const acciones = useMemo(
    () => ({
      enviar: (
        cuerpo: string,
        replyToId: string | null,
        attachmentIds: string[],
        enHilo: boolean,
      ) => sendDirectMessageAction(peerId, cuerpo, replyToId, attachmentIds, enHilo),
      borrar: (messageId: string) => deleteDirectMessageAction(peerId, messageId),
      reaccionar: (messageId: string, emoji: string, on: boolean) =>
        reactDirectAction(peerId, messageId, emoji, on),
      fijar: (messageId: string, on: boolean) => pinDirectAction(peerId, messageId, on),
      editar: (messageId: string, body: string) => editDirectAction(peerId, messageId, body),
      marcarLeido: () => markDirectReadAction(peerId),
      adjuntar: (file: File) => uploadDirectAttachmentAction(peerId, file),
      quitarAdjunto: (attachmentId: string) => deleteDirectAttachmentAction(peerId, attachmentId),
      previewDeLink: previewDeEnlaceAction,
    }),
    [peerId],
  );

  const chatRef = useRef<ChatPanelHandle>(null);

  return (
    <ChatPanel
      ref={chatRef}
      /* Pantalla dedicada: el chat es lo único que hay, así que llena el alto.
         Con el tope de 58vh quedaba una franja muerta contra el borde inferior. */
      /* En móvil la conversación se lleva la pantalla entera, como cualquier
         app de mensajería: con la lista encima quedaban cuatro líneas útiles. */
      pantallaCompletaEnMovil
      salidaMovil={
        <a
          /* ⚠️ `?lista=1` y no `/chat` a secas: el índice redirige a la última
             conversación abierta, así que sin el parámetro este enlace devuelve
             **a la conversación que se acaba de dejar** — pulsar «Conversaciones»
             no hacía nada. Ver la cabecera de `(conversaciones)/page.tsx`. */
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
      rutaCanal={`/me/chats/${peerId}`}
      /* Lo decide la página contra la respuesta del gateway. Ver la prop. */
      canWrite={canWrite}
      /* Sois dos: el «visto por todos» se cumple en cuanto lo lee esa persona. */
      participantes={1}
      motivoSinEscribir="Para escribirle a esta persona debéis compartir al menos un proyecto."
      /**
       * ⚠️ **En privado no se menciona a nadie.** Sois dos: escribir `@Juan`
       * cuando le estás escribiendo a Juan no aporta nada, y el desplegable
       * saltando con cada correo que se teclea sí molesta. El servidor también
       * devuelve la lista de personas vacía, así que no depende solo de esto.
       */
      permiteMenciones={false}
      vacio={`Todavía no habéis hablado. Escríbele a ${peerNombre}.`}
      encabezado={
        <Encabezado
          perfil={directorio.perfiles.get(peerId)}
          peerId={peerId}
          nombre={peerNombre}
          proyectos={proyectosEnComun}
          muted={page.muted}
          isAdmin={isAdmin}
          onSearch={(t) => chatRef.current?.buscarLocal(t)}
          onClear={() => chatRef.current?.cerrarBusqueda()}
        />
      }
    />
  );
}

/**
 * Con quién hablas, y **dónde coincidís**.
 *
 * ⚠️ La jerarquía se enseña por proyecto y nunca resumida en un rol suelto: la
 * misma persona puede administrar un proyecto y solo mirar en otro, así que un
 * único rol junto a su nombre sería una jerarquía inventada.
 *
 * Si no coincidís en ninguno se dice en vez de dejar el hueco, pero **ya no
 * como una negativa**: desde la etapa de la organización activa, no compartir
 * tablero con alguien de tu equipo es un estado corriente y se puede escribir
 * igual. El texto decía «puedes leer el chat, pero no escribir», que hoy es
 * mentira y salía justo encima de un compositor abierto.
 */
function Encabezado({
  perfil,
  peerId,
  nombre,
  proyectos,
  muted,
  isAdmin,
  onSearch,
  onClear,
}: {
  perfil?: UserProfile;
  peerId: string;
  nombre: string;
  proyectos: { id: string; name: string; slug: string; rol: string }[];
  muted: boolean;
  isAdmin?: boolean;
  onSearch: (t: string) => void;
  onClear: () => void;
}) {
  const [ampliada, setAmpliada] = useState(false);
  const inicial = (nombre.charAt(0) || peerId.charAt(0)).toUpperCase();

  const avatarElement = (
    <Avatar
      label={nombre}
      src={perfil?.avatarUrl ? `/api/gateway${perfil.avatarUrl}` : null}
      presence={perfil?.presence}
      size="xl"
    />
  );

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="flex min-w-0 items-center gap-4">
        {/* Avatar clickeable para ampliar */}
        <button
          type="button"
          onClick={() => setAmpliada(true)}
          aria-label={`Ver foto de ${nombre}`}
          title="Ver foto"
          className="shrink-0 cursor-zoom-in transition-transform hover:scale-105 active:scale-95"
        >
          {avatarElement}
        </button>

        {ampliada && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Cerrar imagen"
              onClick={() => setAmpliada(false)}
              className="absolute inset-0 cursor-zoom-out bg-black/80 backdrop-blur-sm transition-opacity"
            />
            <div className="relative z-10 flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200">
              {perfil?.avatarUrl ? (
                <img
                  src={`/api/gateway${perfil.avatarUrl}`}
                  alt={nombre}
                  className="max-h-[70vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
                />
              ) : (
                <div
                  className="flex h-64 w-64 items-center justify-center rounded-full font-sans text-6xl font-medium shadow-2xl"
                  style={{ background: colors.surface, color: colors.textSecondary }}
                >
                  {inicial}
                </div>
              )}
              <div className="text-center">
                <h3 className="font-display text-2xl text-white drop-shadow-md">{nombre}</h3>
                {proyectos.length > 0 && (
                  <p className="font-sans text-sm text-white drop-shadow-md">
                    Coinciden en {proyectos.length}{' '}
                    {proyectos.length === 1 ? 'proyecto' : 'proyectos'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="font-display text-2xl text-text-primary">{nombre}</h2>

          {proyectos.length === 0 ? (
            <p className="font-sans text-xs text-text-secondary">
              {isAdmin
                ? 'No compartís ningún proyecto; puedes chatear porque administras la plataforma.'
                : 'Estáis en la misma organización. Todavía no compartís ningún proyecto.'}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {proyectos.map((proyecto) => (
                <Badge key={proyecto.id} variant="primary">
                  {`${proyecto.rol} · ${proyecto.name}`}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <AnimatedSearchButton onSearch={onSearch} onClear={onClear} />
        <MenuOpciones peerId={peerId} mutedInicial={muted} />
      </div>
    </div>
  );
}

/**
 * Abre la búsqueda de `ChatPanel`, con el mismo estilo que «Silenciar avisos».
 *
 * Vive en la cabecera —fuera del árbol del panel— porque es donde debe estar
 * junto a los demás controles del canal; la llamada real va por
 * `ChatPanelHandle`, que el panel expone justo para esto.
 */

/**
 * Botón de 3 puntos (más opciones) en la cabecera.
 * Contiene "Silenciar avisos" y "Eliminar chat".
 */
function MenuOpciones({ peerId, mutedInicial }: { peerId: string; mutedInicial: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [muted, setMuted] = useState(mutedInicial);
  const [enviandoMute, setEnviandoMute] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar si se hace click fuera
  if (typeof window !== 'undefined') {
    window.onclick = (e) => {
      if (abierto && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setConfirmandoBorrado(false);
      }
    };
  }

  async function alternarMute() {
    setEnviandoMute(true);
    const confirmado = await muteDirectAction(peerId, !muted);
    if (confirmado) setMuted(confirmado.muted);
    setEnviandoMute(false);
    setAbierto(false);
  }

  async function borrarChat() {
    setBorrando(true);
    const { error } = await deleteDirectChatAction(peerId);
    if (error) {
      alert(error);
      setBorrando(false);
      setConfirmandoBorrado(false);
    } else {
      /* ⚠️ Ruta completa. Era `'/'` porque el router anteponía el `basePath`
         de la zona; desde F3 de la fusión no hay ninguno, y un `'/'` sacaría a
         la landing pública después de borrar una conversación. */
      router.push('/chat');
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-label="Más opciones"
        title="Opciones del chat"
        className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border px-2 py-1.5 font-sans text-xs text-white transition-colors hover:text-text-primary hover:bg-surface"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {abierto && (
        <div
          className="absolute right-0 top-full z-50 mt-1 flex w-48 flex-col overflow-hidden rounded-xl border p-1 shadow-lg"
          style={{ background: colors.surfaceElevated, borderColor: colors.border }}
        >
          <button
            type="button"
            onClick={alternarMute}
            disabled={enviandoMute}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left font-sans text-xs text-white transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-50"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              {muted ? (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.54 8.46a5 5 0 010 7.07"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.07 4.93a10 10 0 010 14.14"
                  />
                </>
              )}
            </svg>
            {muted ? 'Activar avisos' : 'Silenciar chat'}
          </button>

          <hr className="my-1 border-border" />

          {!confirmandoBorrado ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmandoBorrado(true);
              }}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left font-sans text-xs text-error transition-colors hover:bg-error/10"
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
                />
              </svg>
              Eliminar chat
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg bg-error/10 p-2">
              <span className="font-sans text-[11px] font-medium text-error">
                ¿Eliminar chat para mí?
              </span>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmandoBorrado(false)}
                  className="rounded px-2 py-1 font-sans text-xs text-error hover:bg-error/20"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={borrarChat}
                  disabled={borrando}
                  className="rounded bg-error px-2 py-1 font-sans text-xs font-semibold text-text-inverse hover:bg-error/90 disabled:opacity-50"
                >
                  {borrando ? '...' : 'Sí'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
