'use client';

import { useState } from 'react';
import type { ChatRefKind } from '../../api/chat-refs';
import { textoPlano } from '../../api/chat-refs';
import { CHAT_REACTIONS, type ChatMessage, type UserProfile, personLabel } from '../../api/domain';
import { Avatar } from '../../atoms/Avatar';
import { alpha, colors } from '../../tokens';
import { RichText } from './RichText';

export interface MessageBubbleProps {
  message: ChatMessage;
  author: UserProfile | undefined;
  mine: boolean;
  /** Continúa un bloque de la misma persona: sin avatar ni cabecera. */
  continued: boolean;
  canDelete: boolean;
  canReact: boolean;
  currentUserId: string;
  /** A dónde lleva pulsar el nombre. `null` si no lleva a ninguna parte. */
  hrefDePersona: string | null;
  hrefDeRef?: (kind: ChatRefKind, id: string) => string | null;
  onResponder: (message: ChatMessage) => void;
  onReaccionar: (messageId: string, emoji: string, on: boolean) => void;
  onBorrar: (messageId: string) => void;
  /** Nombre de quien escribió el mensaje citado, para la cita. */
  nombreDeAutor: (userId: string) => string;
}

/**
 * Un mensaje.
 *
 * ## Las acciones aparecen al pasar por encima, no siempre
 *
 * Tres botones fijos en cada burbuja convierten la conversación en una rejilla
 * de controles y le quitan sitio al texto, que es lo único que se viene a leer.
 * Aparecen al pasar el ratón **y al enfocar con teclado**: con solo
 * `group-hover`, quien navega con tabulador tendría botones que existen y no
 * puede ver.
 */
export function MessageBubble({
  message,
  author,
  mine,
  continued,
  canDelete,
  canReact,
  currentUserId,
  hrefDePersona,
  hrefDeRef,
  onResponder,
  onReaccionar,
  onBorrar,
  nombreDeAutor,
}: MessageBubbleProps) {
  const [eligiendoReaccion, setEligiendoReaccion] = useState(false);
  /**
   * Borrar pide confirmación **en la propia barra**, no en un diálogo.
   *
   * El aspa estaba pegada a «Responder», del mismo tamaño y sin ninguna
   * defensa: un clic de más en la acción de al lado y el mensaje ya no estaba.
   * Y borrar un mensaje **no se deshace** — no hay papelera ni historial de
   * ediciones—, así que es la única acción del chat cuyo error no tiene arreglo.
   *
   * Se resuelve pidiendo un segundo clic sobre un botón que **cambia de sitio,
   * de tamaño y de color**: quien iba a por «Responder» no encuentra ahí lo que
   * esperaba y para. Un `window.confirm` habría servido igual de bien y habría
   * bloqueado la pestaña entera; un diálogo propio son cuarenta líneas para
   * preguntar una cosa.
   */
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const nombre = author ? personLabel(author) : 'Alguien que ya no está';

  /** Las reacciones agrupadas por emoji, con cuántos y si estás dentro. */
  const agrupadas = new Map<string, { total: number; mia: boolean }>();
  for (const reaccion of message.reactions) {
    const actual = agrupadas.get(reaccion.emoji) ?? { total: 0, mia: false };
    actual.total += 1;
    if (reaccion.userId === currentUserId) actual.mia = true;
    agrupadas.set(reaccion.emoji, actual);
  }

  return (
    <article
      className={`relative flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${
        continued ? 'mt-0.5' : 'mt-3'
      }`}
    >
      {/**
       * Hueco del ancho del avatar cuando no se pinta, para que las burbujas
       * seguidas queden alineadas entre sí.
       *
       * ⚠️ **`w-6` porque `Avatar size="sm"` es `h-6 w-6`.** Estaba en `w-8` y el
       * resultado eran 8 px de desfase: la primera burbuja de cada bloque nacía
       * pegada al borde y las siguientes se separaban. Si algún día cambia el
       * tamaño del átomo, esto tiene que cambiar con él.
       */}
      {continued ? (
        <span className="w-6 shrink-0" aria-hidden="true" />
      ) : (
        <Avatar label={nombre} mine={mine} size="sm" />
      )}

      <div className={`flex min-w-0 max-w-[78%] flex-col gap-1 ${mine ? 'items-end' : ''}`}>
        {!continued && (
          <span className="flex items-baseline gap-2 px-1 font-sans text-xs">
            {hrefDePersona && !mine ? (
              <a
                href={hrefDePersona}
                title={`Escribir a ${nombre} en privado`}
                className="font-semibold text-text-primary underline-offset-2 hover:underline"
              >
                {nombre}
              </a>
            ) : (
              <span className="font-semibold text-text-primary">{mine ? 'Tú' : nombre}</span>
            )}
            <span className="text-[11px] text-text-disabled">{soloHora(message.createdAt)}</span>
          </span>
        )}

        {/**
         * ⚠️ **El `group` está aquí, en la burbuja, y no en el `<article>`.**
         *
         * Estaba en la fila entera, que ocupa todo el ancho del panel: pasar el
         * ratón por el hueco vacío de la derecha —o por el avatar, o por el
         * nombre— ya sacaba los tres botones. Con varios mensajes seguidos, se
         * encendían y apagaban solos al mover el ratón por la conversación.
         *
         * Se nombra (`group/burbuja`) a propósito: sin nombre, cualquier `group`
         * que alguien añada más arriba volvería a capturarlo sin avisar.
         */}
        <div
          className="group/burbuja relative min-w-0 max-w-full rounded-2xl px-3.5 py-2"
          onMouseLeave={() => setConfirmandoBorrado(false)}
          style={{
            background: mine ? alpha(colors.primary, 16) : colors.surfaceElevated,
            /* La esquina que apunta al avatar se queda cuadrada solo en el
               primero del bloque: es lo que agrupa los mensajes seguidos
               visualmente sin necesidad de separadores. */
            borderTopLeftRadius: !mine && !continued ? '0.35rem' : undefined,
            borderTopRightRadius: mine && !continued ? '0.35rem' : undefined,
          }}
        >
          {message.replyTo && (
            /**
             * La cita.
             *
             * ⚠️ Si el original se borró, `replyTo` llega `null` desde el
             * servidor —la clave foránea es `SET NULL`— y aquí simplemente no se
             * pinta nada. La respuesta se queda sin cita, no desaparece: es de
             * otra persona y sigue teniendo sentido.
             */
            <div
              className="mb-1.5 flex flex-col gap-0.5 rounded-lg border-l-2 py-1 pl-2.5 pr-2"
              style={{ borderColor: colors.primary, background: alpha(colors.overlay, 18) }}
            >
              <span
                className="font-sans text-[11px] font-semibold"
                style={{ color: colors.primary }}
              >
                {nombreDeAutor(message.replyTo.authorId)}
              </span>
              <span className="line-clamp-2 font-sans text-xs text-text-secondary">
                {textoPlano(message.replyTo.body)}
              </span>
            </div>
          )}

          <RichText cuerpo={message.body} hrefDeRef={hrefDeRef} currentUserId={currentUserId} />

          {/**
           * Las acciones, flotando fuera de la burbuja para no robarle ancho.
           *
           * ⚠️ **`top-1` y no `-top-3.5`.** Estaba por encima del borde superior
           * de la burbuja, y en el primer mensaje del hilo eso quedaba fuera del
           * contenedor con scroll: la barra se recortaba contra el borde de
           * arriba. Ahora cae **dentro**, alineada con la primera línea de texto.
           *
           * ⚠️ Y se ancla al lado **contrario** al avatar, hacia dentro de la
           * conversación (`-right-1` en los ajenos, `-left-1` en los tuyos), en
           * vez de a `right-0`/`left-0`: ahí sobresalía por el costado y en una
           * pantalla estrecha se salía del viewport.
           */}
          <div
            className={`absolute top-1 ${
              mine ? '-left-1 -translate-x-full' : '-right-1 translate-x-full'
            } z-10 flex items-center gap-0.5 rounded-full border border-border px-1 py-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/burbuja:opacity-100`}
            style={{ background: colors.surface }}
          >
            {canReact && (
              <button
                type="button"
                onClick={() => setEligiendoReaccion((abierto) => !abierto)}
                aria-label="Reaccionar"
                title="Reaccionar"
                className="cursor-pointer rounded-full px-1.5 py-0.5 text-[13px] leading-none transition-colors hover:bg-surface-elevated"
              >
                🙂
              </button>
            )}
            <button
              type="button"
              onClick={() => onResponder(message)}
              aria-label="Responder"
              title="Responder"
              className="cursor-pointer rounded-full px-1.5 py-0.5 text-text-disabled transition-colors hover:bg-surface-elevated hover:text-text-primary"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10L4 15l5 5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 4v7a4 4 0 01-4 4H4" />
              </svg>
            </button>

            {canDelete &&
              (confirmandoBorrado ? (
                /* Al confirmar, el botón **cambia de forma**: deja de ser un
                   icono del tamaño de sus vecinos y pasa a ser una palabra en
                   rojo. Quien llegó aquí por error lo lee antes de volver a
                   pulsar; quien venía a borrar lo tiene igual de cerca. */
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmandoBorrado(false);
                      onBorrar(message.id);
                    }}
                    aria-label="Confirmar que se elimina el mensaje"
                    className="cursor-pointer rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold transition-colors"
                    style={{ background: alpha(colors.error, 18), color: colors.error }}
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrado(false)}
                    aria-label="No eliminar"
                    title="Cancelar"
                    className="cursor-pointer rounded-full px-1.5 py-0.5 font-sans text-[11px] text-text-secondary transition-colors hover:text-text-primary"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoBorrado(true)}
                  aria-label="Eliminar mensaje"
                  title="Eliminar"
                  /* Separado del resto por un filete: es la única acción de la
                     barra que no se deshace, y no debe leerse como una más. */
                  className="ml-0.5 cursor-pointer rounded-full border-l border-border py-0.5 pl-1.5 pr-1 text-text-disabled transition-colors hover:text-error"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 7h12M10 7V5h4v2M9 7v10M15 7v10M7 7l1 12h8l1-12"
                    />
                  </svg>
                </button>
              ))}
          </div>

          {eligiendoReaccion && (
            /**
             * **Justo debajo de la barra de opciones, y alineado con ella.**
             *
             * Estuvo flotando sobre la burbuja (`-top-11`) y se salía por arriba
             * en el primer mensaje del hilo. Ahora cuelga del mismo sitio del que
             * salió —el botón de la carita— así que el gesto es continuo: se
             * abre donde estaba el ratón, no en la otra punta del mensaje.
             *
             * `top-10` es la altura de la barra (`top-1` + su alto) más un hueco;
             * si cambia el tamaño de aquella, este número va detrás.
             */
            <div
              className={`absolute top-10 ${
                mine ? '-left-1 -translate-x-full' : '-right-1 translate-x-full'
              } z-20 flex items-center gap-0.5 rounded-full border border-border px-1.5 py-1`}
              style={{
                background: colors.surfaceElevated,
                boxShadow: `0 10px 28px ${alpha(colors.overlay, 50)}`,
              }}
            >
              {CHAT_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReaccionar(message.id, emoji, !agrupadas.get(emoji)?.mia);
                    setEligiendoReaccion(false);
                  }}
                  aria-label={`Reaccionar con ${emoji}`}
                  className="cursor-pointer rounded-full px-1.5 py-0.5 text-base leading-none transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {agrupadas.size > 0 && (
          <div className={`flex flex-wrap gap-1 px-1 ${mine ? 'justify-end' : ''}`}>
            {[...agrupadas.entries()].map(([emoji, { total, mia }]) => (
              <button
                key={emoji}
                type="button"
                disabled={!canReact}
                onClick={() => onReaccionar(message.id, emoji, !mia)}
                aria-pressed={mia}
                /* La tuya se marca con borde y fondo: en un grupo de seis
                   personas, saber si ya reaccionaste es la mitad de la
                   información que da la píldora. */
                className="flex cursor-pointer items-center gap-1 rounded-full border px-1.5 py-0.5 font-sans text-[11px] tabular-nums transition-colors disabled:cursor-not-allowed"
                style={{
                  borderColor: mia ? colors.primary : colors.border,
                  background: mia ? alpha(colors.primary, 18) : 'transparent',
                  color: mia ? colors.primary : colors.textSecondary,
                }}
              >
                <span className="text-[13px] leading-none">{emoji}</span>
                {total}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** Solo la hora: el día lo dice el separador que encabeza el bloque. */
function soloHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}
