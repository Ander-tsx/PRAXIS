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
      className={`group relative flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${
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

        <div
          className="relative min-w-0 max-w-full rounded-2xl px-3.5 py-2"
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

          {/* Las acciones, flotando fuera de la burbuja para no robarle ancho. */}
          <div
            className={`absolute -top-3.5 ${
              mine ? 'left-0' : 'right-0'
            } flex items-center gap-0.5 rounded-full border border-border px-1 py-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100`}
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
            {canDelete && (
              <button
                type="button"
                onClick={() => onBorrar(message.id)}
                aria-label="Eliminar mensaje"
                title="Eliminar"
                className="cursor-pointer rounded-full px-1.5 py-0.5 text-text-disabled transition-colors hover:bg-surface-elevated hover:text-error"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>

          {eligiendoReaccion && (
            <div
              className={`absolute -top-11 ${
                mine ? 'left-0' : 'right-0'
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
