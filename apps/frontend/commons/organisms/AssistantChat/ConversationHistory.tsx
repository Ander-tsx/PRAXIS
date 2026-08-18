'use client';

import { useEffect, useState } from 'react';
import type { ConversationSummary } from '../../api/assistant';
import {
  borrarConversacionAction,
  conversacionesAction,
  renombrarConversacionAction,
} from '../../assistant/actions';
import { Button } from '../../atoms';
import { alpha, colors } from '../../tokens';

/**
 * El historial, **ocupando toda la sección**.
 *
 * No es un panel que se despliega encima del chat: al pulsar «Historial», la
 * tarjeta entera deja de ser un chat y pasa a ser esta lista. Se probó lo otro
 * —un desplegable sobre el hilo— y no funcionaba: el chat vive entre los
 * gráficos del informe, así que el panel salía estrecho y se comía el hilo que
 * estabas leyendo para enseñar cuatro títulos.
 *
 * Aquí hay sitio para lo que hace falta al elegir: el título entero sin
 * recortar, cuándo se habló y cuánto se habló.
 *
 * De aquí solo se sale eligiendo: abrir una conversación o empezar una nueva.
 * Las dos llevan al chat, que es donde se puede hacer algo.
 */
export function ConversationHistory({
  projectId,
  activaId,
  onElegir,
  onNueva,
  onBorrarActiva,
}: {
  projectId: string;
  /** La que está abierta ahora mismo, para señalarla en la lista. */
  activaId: string | null;
  onElegir: (id: string) => void;
  onNueva: () => void;
  /** Si se borra la que estaba abierta, el chat tiene que vaciarse. */
  onBorrarActiva: () => void;
}) {
  const [lista, setLista] = useState<ConversationSummary[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');

  useEffect(() => {
    let vigente = true;
    conversacionesAction(projectId).then((conversaciones) => {
      /* Si se salió del historial mientras llegaba, no se toca el estado. */
      if (vigente) setLista(conversaciones);
    });
    return () => {
      vigente = false;
    };
  }, [projectId]);

  async function renombrar(id: string) {
    const nuevo = titulo.trim();
    setEditando(null);
    if (!nuevo) return;

    /* Optimista: renombrar no falla de forma interesante, y ver el título nuevo
       al instante es lo que hace que la conversación se sienta propia. */
    setLista((previa) => (previa ?? []).map((c) => (c.id === id ? { ...c, title: nuevo } : c)));
    await renombrarConversacionAction(projectId, id, nuevo);
  }

  async function borrar(id: string) {
    setLista((previa) => (previa ?? []).filter((c) => c.id !== id));
    if (id === activaId) onBorrarActiva();
    await borrarConversacionAction(projectId, id);
  }

  return (
    <div className="flex flex-col gap-4">
      <Button size="sm" onClick={onNueva}>
        Nueva conversación
      </Button>

      {lista === null && (
        <p className="py-8 text-center font-sans text-sm text-text-disabled">Cargando…</p>
      )}

      {lista !== null && lista.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="font-display text-base text-text-primary">
            Todavía no has hablado con el asistente aquí
          </p>
          <p className="mt-1 font-sans text-sm text-text-secondary">
            Las conversaciones de este proyecto se guardan y puedes retomarlas cuando quieras.
          </p>
        </div>
      )}

      {(lista ?? []).map((conversacion) => {
        const activa = conversacion.id === activaId;
        return (
          <div
            key={conversacion.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
            style={{
              borderColor: activa ? alpha(colors.primary, 40) : colors.border,
              background: activa ? alpha(colors.primary, 8) : 'transparent',
            }}
          >
            {editando === conversacion.id ? (
              <input
                value={titulo}
                onChange={(evento) => setTitulo(evento.target.value)}
                onBlur={() => renombrar(conversacion.id)}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') renombrar(conversacion.id);
                  if (evento.key === 'Escape') setEditando(null);
                }}
                maxLength={60}
                // biome-ignore lint/a11y/noAutofocus: se acaba de pulsar «Renombrar»; el foco es lo que se pidió
                autoFocus
                className="min-w-0 flex-1 rounded-lg bg-background px-3 py-2 font-sans text-sm text-text-primary outline-none ring-1 ring-primary"
                aria-label="Nuevo título de la conversación"
              />
            ) : (
              <button
                type="button"
                onClick={() => onElegir(conversacion.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate font-sans text-sm text-text-primary">
                  {conversacion.title}
                </span>
                <span className="mt-0.5 block font-sans text-xs text-text-disabled">
                  {conversacion.mensajes === 1 ? '1 mensaje' : `${conversacion.mensajes} mensajes`}
                  {' · '}
                  {cuando(conversacion.updatedAt)}
                  {activa && ' · abierta'}
                </span>
              </button>
            )}

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setEditando(conversacion.id);
                  setTitulo(conversacion.title);
                }}
                className="rounded-lg px-2 py-1 font-sans text-xs text-text-disabled transition-colors hover:text-text-primary"
              >
                Renombrar
              </button>
              <button
                type="button"
                onClick={() => borrar(conversacion.id)}
                className="rounded-lg px-2 py-1 font-sans text-xs text-text-disabled transition-colors hover:text-error"
              >
                Borrar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * «hoy», «ayer» o la fecha corta.
 *
 * Lo mismo que hace la tarjeta del tablero con los vencimientos, y por lo mismo:
 * en una lista que se ojea, «ayer» se lee de un vistazo y «30 jul» hay que
 * pensarlo.
 */
function cuando(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';

  const hoy = new Date();
  const dias = Math.round(
    (new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() -
      new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime()) /
      86_400_000,
  );

  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}
