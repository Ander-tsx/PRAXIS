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
          /* Al irse del mensaje se recoge todo: ni el selector de reacciones ni
             la confirmación de borrado tienen sentido sobre una burbuja que ya
             no estás mirando, y dejarlos abiertos es lo que obligaba a cerrarlos
             a mano. Cubre además el caso de abrir el selector y apartar el ratón
             sin llegar a entrar en él. */
          onMouseLeave={() => {
            setConfirmandoBorrado(false);
            setEligiendoReaccion(false);
          }}
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
           * La barra de acciones del mensaje.
           *
           * ## Las seis reacciones van dentro, no detrás de un botón
           *
           * Antes había una carita que abría un segundo desplegable. Eran dos
           * pasos, dos superficies flotantes y un hueco entre ellas por el que
           * el puntero se salía —lo que hacía imposible llegar al emoji— y todo
           * para elegir entre **seis** opciones que caben de sobra en una fila.
           * Con el conjunto cerrado que tiene el chat, el menú sobraba: ahora
           * reaccionar es un clic y no hay nada que cruzar.
           *
           * ## Y por qué se solapa con la burbuja
           *
           * Se ancla sobre el borde superior, hacia dentro del ancho del
           * mensaje. Fuera se salía del viewport en pantallas estrechas y se
           * recortaba contra el borde del hilo en el primer mensaje; aquí no
           * puede pasar ninguna de las dos, porque nunca sobresale de la
           * burbuja.
           *
           * ⚠️ **Sin `focus-within`**, que es lo que la dejaba fija: al pulsar
           * un botón el foco se queda en él y la barra no se iba al apartar el
           * ratón. `focus-visible` cubre el teclado sin ese efecto.
           */}
          <div
            className={`absolute -top-4 z-10 flex items-center gap-0.5 rounded-xl border p-1 opacity-0 shadow-lg transition-all duration-150 group-hover/burbuja:opacity-100 has-[:focus-visible]:opacity-100 ${
              mine ? 'left-2' : 'right-2'
            } ${
              /* Mientras se confirma un borrado se queda: la pregunta no puede
                 irse antes de que se pueda responder. */
              confirmandoBorrado ? 'opacity-100' : ''
            }`}
            style={{
              background: colors.surfaceElevated,
              borderColor: colors.border,
              boxShadow: `0 8px 24px ${alpha(colors.overlay, 45)}`,
            }}
          >
            {canReact &&
              !confirmandoBorrado &&
              CHAT_REACTIONS.map((emoji) => {
                const puesta = agrupadas.get(emoji)?.mia ?? false;
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReaccionar(message.id, emoji, !puesta)}
                    aria-label={puesta ? `Quitar ${emoji}` : `Reaccionar con ${emoji}`}
                    aria-pressed={puesta}
                    title={emoji}
                    /* `active:scale-90` además del `hover`: el emoji se hunde al
                       pulsarlo y vuelve, que es el acuse de recibo que hace que
                       un clic se sienta atendido aunque la red tarde. */
                    className="cursor-pointer rounded-lg px-1 py-0.5 text-[15px] leading-none transition-transform duration-100 hover:scale-125 active:scale-90"
                    style={puesta ? { background: alpha(colors.primary, 20) } : undefined}
                  >
                    {emoji}
                  </button>
                );
              })}

            {canReact && !confirmandoBorrado && (
              <span
                aria-hidden="true"
                className="mx-0.5 h-4 w-px shrink-0"
                style={{ background: colors.border }}
              />
            )}

            {!confirmandoBorrado && (
              <button
                type="button"
                onClick={() => onResponder(message)}
                aria-label="Responder"
                title="Responder"
                className="cursor-pointer rounded-lg p-1 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              >
                <svg
                  className="h-4 w-4"
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
            )}

            {canDelete &&
              (confirmandoBorrado ? (
                /**
                 * Al confirmar, la barra **se convierte en la pregunta**.
                 *
                 * Se ocultan las reacciones y responder: dejarlas al lado de un
                 * «Eliminar» en rojo invita a pulsar mal justo en la única
                 * acción que no se deshace. Lo que queda es la decisión.
                 */
                <span className="flex items-center gap-1 px-1">
                  <span className="font-sans text-xs text-text-secondary">¿Eliminar?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmandoBorrado(false);
                      onBorrar(message.id);
                    }}
                    aria-label="Confirmar que se elimina el mensaje"
                    className="cursor-pointer rounded-lg px-2 py-0.5 font-sans text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{ background: colors.error, color: colors.textInverse }}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrado(false)}
                    aria-label="No eliminar"
                    className="cursor-pointer rounded-lg px-2 py-0.5 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                  >
                    No
                  </button>
                </span>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="mx-0.5 h-4 w-px shrink-0"
                    style={{ background: colors.border }}
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrado(true)}
                    aria-label="Eliminar mensaje"
                    title="Eliminar"
                    className="cursor-pointer rounded-lg p-1 text-text-disabled transition-colors hover:bg-surface hover:text-error"
                  >
                    <svg
                      className="h-4 w-4"
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
                </>
              ))}
          </div>
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
