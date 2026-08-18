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
  nombresDeProyecto,
  activaId,
  onElegir,
  onNueva,
  onBorrarActiva,
}: {
  /**
   * `projectId` → nombre, para poder decir de qué iba cada conversación.
   *
   * Solo trae los proyectos que quien mira puede abrir. Una conversación sobre
   * uno que ya no está en esa lista —lo archivaron, o le quitaron el acceso—
   * se queda sin nombre, y eso se pinta como «otro proyecto» en vez de con un
   * UUID: decir el id no ayuda a nadie y decir el nombre sería enseñar algo a lo
   * que ya no tiene acceso.
   */
  nombresDeProyecto: Record<string, string>;
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
    conversacionesAction().then((conversaciones) => {
      /* Si se salió del historial mientras llegaba, no se toca el estado. */
      if (vigente) setLista(conversaciones);
    });
    return () => {
      vigente = false;
    };
  }, []);

  async function renombrar(id: string) {
    const nuevo = titulo.trim();
    setEditando(null);
    if (!nuevo) return;

    /* Optimista: renombrar no falla de forma interesante, y ver el título nuevo
       al instante es lo que hace que la conversación se sienta propia. */
    setLista((previa) => (previa ?? []).map((c) => (c.id === id ? { ...c, title: nuevo } : c)));
    await renombrarConversacionAction(id, nuevo);
  }

  async function borrar(id: string) {
    setLista((previa) => (previa ?? []).filter((c) => c.id !== id));
    if (id === activaId) onBorrarActiva();
    await borrarConversacionAction(id);
  }

  return (
    /* `gap-1.5` entre filas y no `gap-4`: son elementos de una lista, no
       tarjetas sueltas. Con el hueco de antes, seis conversaciones ya no cabían
       en el cajón. */
    <div className="flex min-h-0 flex-col gap-3">
      <Button size="sm" onClick={onNueva}>
        Nueva conversación
      </Button>

      <div className="scrollbar-slim flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {lista === null && (
          <p className="py-8 text-center font-sans text-sm text-text-disabled">Cargando…</p>
        )}

        {lista !== null && lista.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="font-display text-base text-text-primary">
              Todavía no has hablado con el asistente
            </p>
            <p className="mt-1 font-sans text-sm text-text-secondary">
              Las conversaciones se guardan y puedes retomarlas cuando quieras.
            </p>
          </div>
        )}

        {(lista ?? []).map((conversacion) => {
          const activa = conversacion.id === activaId;
          return (
            <div
              key={conversacion.id}
              /* ⚠️ `flex-nowrap` y no `flex-wrap`. Con `wrap`, en el cajón —que es
               estrecho— las dos acciones se caían a una segunda línea y cada fila
               pasaba a ocupar el doble: la lista entera se veía estirada y solo
               cabían tres conversaciones. Ahora el título se encoge (`min-w-0` +
               `truncate`) y las acciones se quedan donde están. */
              className="group flex flex-nowrap items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors hover:border-border-strong"
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
                  <span className="mt-0.5 block truncate font-sans text-xs text-text-disabled">
                    {/* El proyecto primero: es lo que se busca al repasar la lista
                      desde que el historial ya no está partido por proyecto. */}
                    {conversacion.projectId
                      ? (nombresDeProyecto[conversacion.projectId] ?? 'otro proyecto')
                      : 'sin proyecto'}
                    {' · '}
                    {cuando(conversacion.updatedAt)}
                    {activa && ' · abierta'}
                  </span>
                </button>
              )}

              {/* ⚠️ Las acciones **solo al apuntar**, y con icono en vez de texto.
                «Renombrar» y «Borrar» escritos ocupaban más que el propio título
                en el cajón, y estaban visibles en las veinte filas a la vez: la
                lista se leía como una tabla de botones en vez de como un
                historial. En táctil no hay hover, así que ahí se quedan siempre
                visibles (`opacity-100` de base, se apagan solo desde `sm`). */}
              <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditando(conversacion.id);
                    setTitulo(conversacion.title);
                  }}
                  aria-label={`Renombrar «${conversacion.title}»`}
                  title="Renombrar"
                  className="rounded-md p-1.5 text-text-disabled transition-colors hover:bg-surface hover:text-text-primary"
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
                      d="M16.5 4.5l3 3L8 19H5v-3z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => borrar(conversacion.id)}
                  aria-label={`Borrar «${conversacion.title}»`}
                  title="Borrar"
                  className="rounded-md p-1.5 text-text-disabled transition-colors hover:bg-surface hover:text-error"
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
                      d="M6 7h12M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7m2 0v11.5A1.5 1.5 0 0115.5 20h-7A1.5 1.5 0 017 18.5V7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
