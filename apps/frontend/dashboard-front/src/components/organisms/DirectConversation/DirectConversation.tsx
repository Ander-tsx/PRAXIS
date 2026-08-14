'use client';

import {
  deleteDirectMessageAction,
  markDirectReadAction,
  muteDirectAction,
  reactDirectAction,
  sendDirectMessageAction,
} from '@/app/(private)/chat/actions';
import { Badge, type ChatMessagePage, ChatPanel, type UserProfile } from '@praxis/commons';
import { useMemo, useState } from 'react';

export interface DirectConversationProps {
  peerId: string;
  peerNombre: string;
  /** Dónde coincidís y qué es esa persona allí. */
  proyectosEnComun: { id: string; name: string; slug: string; rol: string }[];
  page: ChatMessagePage;
  usersById: Map<string, UserProfile>;
  currentUserId: string;
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
  usersById,
  currentUserId,
}: DirectConversationProps) {
  /* `useCallback` porque `ChatPanel` las tiene en las dependencias de un efecto:
     recreadas en cada render, marcaría como leído en bucle. */
  const acciones = useMemo(
    () => ({
      enviar: (cuerpo: string, replyToId: string | null) =>
        sendDirectMessageAction(peerId, cuerpo, replyToId),
      borrar: (messageId: string) => deleteDirectMessageAction(peerId, messageId),
      reaccionar: (messageId: string, emoji: string, on: boolean) =>
        reactDirectAction(peerId, messageId, emoji, on),
      marcarLeido: () => markDirectReadAction(peerId),
    }),
    [peerId],
  );

  return (
    <ChatPanel
      page={page}
      usersById={usersById}
      currentUserId={currentUserId}
      acciones={acciones}
      gatewayPath="/dashboard/api/gateway"
      rutaCanal={`/me/chats/${peerId}`}
      /**
       * Puedes escribir mientras compartáis algún proyecto.
       *
       * ⚠️ Si dejáis de compartirlo, el gateway responde 403 al enviar pero **la
       * conversación se sigue abriendo y leyendo**. Apagar el redactor aquí es lo
       * que convierte ese 403 en algo que se entiende antes de escribir, en vez
       * de después de darle a enviar.
       */
      canWrite={proyectosEnComun.length > 0}
      motivoSinEscribir="Ya no compartís ningún proyecto, así que no puedes escribirle. Lo que os dijisteis sigue aquí."
      /* No hay moderación: no existe un rol por encima de una conversación de dos. */
      canModerate={false}
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
          peerId={peerId}
          nombre={peerNombre}
          proyectos={proyectosEnComun}
          muted={page.muted}
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
 * Si no coincidís en ninguno —salió de los equipos después de hablar— se dice
 * en vez de dejar el hueco: explica por qué ya no puedes escribirle.
 */
function Encabezado({
  peerId,
  nombre,
  proyectos,
  muted,
}: {
  peerId: string;
  nombre: string;
  proyectos: { id: string; name: string; slug: string; rol: string }[];
  muted: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 className="font-display text-2xl text-text-primary">{nombre}</h2>

        {proyectos.length === 0 ? (
          <p className="font-sans text-xs text-text-secondary">
            Ya no compartís ningún proyecto. Puedes leer lo que os dijisteis, pero no escribir.
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

      <BotonSilenciar peerId={peerId} inicial={muted} />
    </div>
  );
}

/**
 * ⚠️ El texto dice **«avisos»** y no «notificaciones»: silenciar apaga la
 * tarjeta y el sonido, pero **el contador sigue**. Un botón que dijera
 * «silenciar la conversación» prometería no volver a saber nada de ella.
 */
function BotonSilenciar({ peerId, inicial }: { peerId: string; inicial: boolean }) {
  const [muted, setMuted] = useState(inicial);
  const [enviando, setEnviando] = useState(false);

  async function alternar() {
    setEnviando(true);
    const confirmado = await muteDirectAction(peerId, !muted);
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
          ? 'Los avisos de esta conversación están apagados. Los mensajes sin leer se siguen contando.'
          : 'Apagar la tarjeta y el sonido. Los mensajes sin leer se siguen contando.'
      }
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {muted ? 'Avisos apagados' : 'Silenciar avisos'}
    </button>
  );
}
