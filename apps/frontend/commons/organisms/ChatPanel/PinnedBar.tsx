'use client';

import { textoPlano } from '../../api/chat-refs';
import type { ChatMessage } from '../../api/domain';
import { alpha, colors } from '../../tokens';

export interface PinnedBarProps {
  /** Los fijados, del más reciente al más antiguo — el mismo orden que da el servidor. */
  fijados: ChatMessage[];
  /** Cuál se enseña en la barra compacta. */
  indice: number;
  /** Si la lista completa está desplegada debajo de la barra. */
  expandido: boolean;
  onExpandirCambiar: (expandido: boolean) => void;
  /** Salta al mensaje en el historial y avanza el puntero al siguiente fijado. */
  onIr: (messageId: string) => void;
  nombreDeAutor: (userId: string) => string;
}

/**
 * La barra de mensajes fijados, anclada bajo la cabecera.
 *
 * ## El modelo es el de Telegram, no una lista aparte
 *
 * Con un solo fijado, pulsar la barra lleva a él. Con varios, pulsar lleva al
 * que se enseña **y avanza el puntero al siguiente** — así pulsar varias veces
 * seguidas recorre todos sin abrir nada. La flecha despliega la lista entera
 * para ir a uno concreto sin tener que pulsar de uno en uno.
 *
 * No vive dentro del scroller de la conversación: **no se mueve con el
 * historial**, que es justo lo que la distingue del realce en la propia
 * burbuja del mensaje (ver `MessageBubble`).
 *
 * ⚠️ **Sin botón de desfijar aquí.** Estuvo, pero la barra es angosta y el
 * clic cae fácilmente sobre él por error, desfijando lo que no querías. Para
 * desfijar está el icono de la propia burbuja del mensaje, que no comparte
 * fila con nada más.
 */
export function PinnedBar({
  fijados,
  indice,
  expandido,
  onExpandirCambiar,
  onIr,
  nombreDeAutor,
}: PinnedBarProps) {
  if (fijados.length === 0) return null;

  // Por si la lista encoge (se desfija el último) y el índice se queda corto.
  const actualIndice = Math.min(indice, fijados.length - 1);
  const actual = fijados[actualIndice];
  if (!actual) return null;

  return (
    <div className="relative shrink-0 border-b" style={{ borderColor: colors.border }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: alpha(colors.primary, 14) }}
        >
          <svg
            className="h-3.5 w-3.5"
            style={{ color: colors.primary }}
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
          </svg>
        </span>

        <button
          type="button"
          onClick={() => onIr(actual.id)}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <span
            className="font-sans text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: colors.primary }}
          >
            {fijados.length > 1 ? `Fijado ${actualIndice + 1}/${fijados.length}` : 'Fijado'}
          </span>
          <span className="line-clamp-1 block font-sans text-xs text-text-secondary">
            <span className="font-medium text-text-primary">
              {nombreDeAutor(actual.authorId)}:{' '}
            </span>
            {previewDeMensaje(actual)}
          </span>
        </button>

        {fijados.length > 1 && (
          <button
            type="button"
            onClick={() => onExpandirCambiar(!expandido)}
            aria-label={expandido ? 'Ocultar todos los fijados' : 'Ver todos los fijados'}
            aria-expanded={expandido}
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-text-disabled transition-colors hover:bg-overlay/5 hover:text-text-primary"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expandido ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {expandido && (
        <div
          className="absolute inset-x-0 top-full z-20 max-h-64 overflow-y-auto border-b shadow-lg"
          style={{ background: colors.surfaceElevated, borderColor: colors.border }}
        >
          {fijados.map((mensaje) => (
            <button
              key={mensaje.id}
              type="button"
              onClick={() => {
                onExpandirCambiar(false);
                onIr(mensaje.id);
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-overlay/5"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-xs font-medium text-text-primary">
                  {nombreDeAutor(mensaje.authorId)}
                </span>
                <span className="line-clamp-1 block font-sans text-xs text-text-secondary">
                  {previewDeMensaje(mensaje)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * El texto de un fijado, o qué es si no tiene texto.
 *
 * Un mensaje puede ser solo un archivo —`body` vacío—, y `textoPlano('')` es
 * una cadena vacía: la barra se vería con el nombre de quien fijó y nada más,
 * como si el mensaje estuviera roto. Aquí se dice qué es, no el nombre del
 * archivo —ese no importa para reconocer el mensaje, y sí para el ruido visual.
 */
function previewDeMensaje(mensaje: ChatMessage): string {
  const texto = textoPlano(mensaje.body).trim();
  if (texto) return texto;

  const primero = mensaje.attachments[0];
  if (!primero) return '';
  if (primero.mimeType.startsWith('image/')) return '📷 Imagen';
  if (primero.mimeType.startsWith('video/')) return '🎬 Vídeo';
  return '📎 Archivo';
}
