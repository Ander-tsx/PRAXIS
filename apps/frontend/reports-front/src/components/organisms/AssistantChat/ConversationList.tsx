'use client';

import { Button, alpha, colors } from '@praxis/commons';
import { useEffect, useState } from 'react';
import {
  borrarConversacionAction,
  conversacionesAction,
  renombrarConversacionAction,
} from '@/app/(private)/[id]/actions';
import type { ConversacionResumen } from '@/lib/assistant';

/**
 * Las conversaciones guardadas, en un panel que se despliega sobre el chat.
 *
 * **No es una barra lateral fija.** El chat vive dentro de la página de
 * reportes, entre los gráficos, y una columna permanente de conversaciones le
 * robaría la mitad del ancho a lo que se ha venido a leer. Se abre cuando se
 * busca y se cierra al elegir.
 *
 * La lista se pide **al abrir** y no al montar la página: casi nadie la abre, y
 * pedirla siempre sería una petición por carga de la pantalla de reportes para
 * pintar algo que suele estar cerrado.
 */
export function ConversationList({
  projectId,
  activaId,
  onElegir,
  onNueva,
  onBorrarActiva,
}: {
  projectId: string;
  activaId: string | null;
  onElegir: (id: string) => void;
  onNueva: () => void;
  /** Si se borra la que está abierta, el chat tiene que vaciarse. */
  onBorrarActiva: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<ConversacionResumen[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setCargando(true);
    conversacionesAction(projectId).then((conversaciones) => {
      /* Si el panel se cerró mientras llegaba, no se toca el estado: pintaría
         una lista que ya nadie está mirando. */
      if (!vigente) return;
      setLista(conversaciones);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [abierto, projectId]);

  async function renombrar(id: string) {
    const nuevo = titulo.trim();
    setEditando(null);
    if (!nuevo) return;

    /* Optimista: renombrar no puede fallar de forma interesante, y ver el
       título nuevo al instante es lo que hace que se sienta como propio. */
    setLista((previa) =>
      (previa ?? []).map((c) => (c.id === id ? { ...c, title: nuevo } : c)),
    );
    await renombrarConversacionAction(projectId, id, nuevo);
  }

  async function borrar(id: string) {
    setLista((previa) => (previa ?? []).filter((c) => c.id !== id));
    if (id === activaId) onBorrarActiva();
    await borrarConversacionAction(projectId, id);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAbierto((previo) => !previo)}
          aria-expanded={abierto}
        >
          {abierto ? 'Ocultar conversaciones' : 'Conversaciones'}
        </Button>
        {activaId && (
          <Button size="sm" variant="ghost" onClick={onNueva}>
            Nueva conversación
          </Button>
        )}
      </div>

      {abierto && (
        <div
          className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border p-2"
          style={{ borderColor: alpha(colors.primary, 20), background: colors.background }}
        >
          {cargando && (
            <p className="px-2 py-3 font-sans text-sm text-text-disabled">Cargando…</p>
          )}

          {!cargando && (lista ?? []).length === 0 && (
            <p className="px-2 py-3 font-sans text-sm text-text-disabled">
              Todavía no has hablado con el asistente en este proyecto.
            </p>
          )}

          {(lista ?? []).map((conversacion) => (
            <div
              key={conversacion.id}
              className="flex items-center gap-1 rounded-lg px-1"
              style={
                conversacion.id === activaId
                  ? { background: alpha(colors.primary, 12) }
                  : undefined
              }
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
                  className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1.5 font-sans text-sm text-text-primary outline-none"
                  aria-label="Nuevo título de la conversación"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onElegir(conversacion.id);
                    setAbierto(false);
                  }}
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left font-sans text-sm text-text-secondary transition-colors hover:text-text-primary"
                  title={conversacion.title}
                >
                  {conversacion.title}
                  <span className="ml-2 text-xs text-text-disabled tabular-nums">
                    {conversacion.mensajes}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setEditando(conversacion.id);
                  setTitulo(conversacion.title);
                }}
                className="shrink-0 rounded px-2 py-1 font-sans text-xs text-text-disabled transition-colors hover:text-text-primary"
              >
                Renombrar
              </button>
              <button
                type="button"
                onClick={() => borrar(conversacion.id)}
                className="shrink-0 rounded px-2 py-1 font-sans text-xs text-text-disabled transition-colors hover:text-error"
              >
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
