'use client';

import {
  deleteDocumentAction,
  saveDocumentAction,
} from '@/app/(privado)/projects/[id]/document-actions';
import { DOCUMENT_INITIAL_STATE } from '@/lib/projects/action-state';
import {
  DOCUMENT_CONTENT_MAX,
  ModelText,
  type ProjectDocument,
  type UserProfile,
  personLabel,
  useAccion,
} from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface DocumentViewProps {
  documento: ProjectDocument;
  projectId: string;
  /** Crear, editar y borrar: `canEditDocuments`. Sin él, solo lectura. */
  canEdit: boolean;
  usersById: Map<string, UserProfile>;
  /** Tras borrarlo, a qué se vuelve: lo decide quien tiene la lista. */
  onBorrado: () => void;
}

const fechaYHora = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Un documento del espacio: Markdown con vista previa (`docs/PLAN-DOCUMENTOS.md`).
 *
 * ## Borrador local, y solo mientras se edita
 *
 * Lo que se ve es el documento del servidor **hasta que alguien escribe**; a
 * partir de ahí manda el borrador. Guardar lo descarta, y lo que llega de la
 * revalidación —en la misma respuesta de la acción— es lo que se ve. Así no hay
 * que sincronizar estado con props en ningún efecto.
 *
 * ## Se guarda al salir del campo, con Ctrl/⌘+S y con el botón
 *
 * Nunca en cada tecla (D6). Formulario de **edición**: nada de `action=`, que
 * React 19 resetearía al enviar (`CLAUDE.md`).
 *
 * ## Si alguien guardó antes (D4)
 *
 * El servidor responde 409 y aquí no se pierde nada: el borrador sigue en
 * pantalla, con un botón para copiarlo y otro para cargar la versión nueva.
 */
export function DocumentView({
  documento,
  projectId,
  canEdit,
  usersById,
  onBorrado,
}: DocumentViewProps) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<{ title: string; content: string } | null>(null);
  const [modo, setModo] = useState<'escribir' | 'leer'>(() =>
    canEdit && documento.content.trim() === '' ? 'escribir' : 'leer',
  );
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const [estado, guardar, guardando] = useAccion(saveDocumentAction, DOCUMENT_INITIAL_STATE);
  const [estadoBorrado, borrar, borrando] = useAccion(deleteDocumentAction, DOCUMENT_INITIAL_STATE);

  const titulo = borrador?.title ?? documento.title;
  const contenido = borrador?.content ?? documento.content;
  const sucio =
    borrador !== null &&
    (borrador.title !== documento.title || borrador.content !== documento.content);

  /* Lo último que se mandó: evita mandar dos veces lo mismo si llegan dos
     `blur` seguidos, y dice qué borrador se puede descartar al confirmarse. */
  const [enviado, setEnviado] = useState<{ title: string; content: string; base: string } | null>(
    null,
  );

  /**
   * ⚠️ **Una `ref`, no estado, para saber si hay un guardado en vuelo.** Al
   * pulsar «Guardar» llegan dos llamadas en el mismo instante —el `blur` del
   * campo y el clic—, y las dos leían el estado de antes del render: salían dos
   * peticiones con la misma versión esperada, la primera ganaba y la segunda
   * volvía con un 409 contra uno mismo. La `ref` cambia en el acto.
   */
  const enVuelo = useRef(false);
  /* Lo que se pidió guardar mientras otro guardado iba en vuelo: se repite al
     terminar, con la versión nueva, en vez de perderse. */
  const repetir = useRef(false);

  function guardarSiHaceFalta() {
    if (!canEdit || !borrador || !sucio) return;
    if (guardando || enVuelo.current) {
      repetir.current = true;
      return;
    }
    if (
      enviado &&
      enviado.base === documento.updatedAt &&
      enviado.title === borrador.title &&
      enviado.content === borrador.content
    ) {
      return;
    }
    enVuelo.current = true;
    setEnviado({ ...borrador, base: documento.updatedAt });

    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('workspaceId', documento.workspaceId);
    datos.set('documentId', documento.id);
    datos.set('title', borrador.title);
    datos.set('content', borrador.content);
    datos.set('expectedUpdatedAt', documento.updatedAt);
    guardar(datos);
  }

  /**
   * Guardado confirmado: el borrador sobra **si es lo que se mandó**. Si se
   * siguió escribiendo mientras la petición iba en vuelo, se conserva — sigue
   * sucio respecto a la versión nueva y se guardará en el siguiente `blur`.
   *
   * Ajuste de estado durante el render, con guarda, en vez de un efecto: es la
   * forma que recomienda React para derivar estado de un cambio de props.
   */
  const [ultimoConfirmado, setUltimoConfirmado] = useState<string | null>(null);
  if (estado.done === 'saved' && documento.updatedAt !== ultimoConfirmado) {
    setUltimoConfirmado(documento.updatedAt);
    if (
      borrador &&
      enviado &&
      borrador.title === enviado.title &&
      borrador.content === enviado.content
    ) {
      setBorrador(null);
    }
    setEnviado(null);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al llegar una respuesta nueva.
  useEffect(() => {
    enVuelo.current = false;
    if (repetir.current && !estado.conflicto) {
      repetir.current = false;
      guardarSiHaceFalta();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al llegar una respuesta nueva
  }, [estado]);

  useEffect(() => {
    if (estadoBorrado.done === 'deleted') onBorrado();
  }, [estadoBorrado.done, onBorrado]);

  function alTeclear(evento: React.KeyboardEvent) {
    if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === 's') {
      evento.preventDefault();
      guardarSiHaceFalta();
    }
  }

  function editar(cambio: Partial<{ title: string; content: string }>) {
    setBorrador({ title: titulo, content: contenido, ...cambio });
  }

  async function copiarLoMio() {
    try {
      await navigator.clipboard.writeText(`# ${titulo}\n\n${contenido}`);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  const autor = usersById.get(documento.updatedBy);

  return (
    <article
      aria-label={`Documento ${documento.title}`}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 pb-10">
        <header className="flex flex-col gap-2 border-b border-border pb-3">
          {canEdit ? (
            <input
              value={titulo}
              onChange={(e) => editar({ title: e.target.value })}
              onBlur={guardarSiHaceFalta}
              onKeyDown={alTeclear}
              maxLength={200}
              aria-label="Título del documento"
              className="w-full bg-transparent font-display text-3xl leading-tight text-text-primary outline-none"
            />
          ) : (
            <h2 className="font-display text-3xl leading-tight text-text-primary">{titulo}</h2>
          )}

          <div className="flex flex-wrap items-center gap-3 font-sans text-xs text-text-secondary">
            <span>
              {guardando
                ? 'Guardando…'
                : sucio
                  ? 'Sin guardar'
                  : `Editado ${fechaYHora.format(new Date(documento.updatedAt))}${
                      autor ? ` por ${personLabel(autor)}` : ''
                    }`}
            </span>

            {canEdit && (
              <span className="ml-auto flex items-center gap-3">
                <span className="flex gap-0.5 rounded-lg border border-border p-0.5">
                  {(['escribir', 'leer'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={modo === m}
                      onClick={() => setModo(m)}
                      className={`cursor-pointer rounded-md px-2 py-0.5 transition-colors ${
                        modo === m ? 'bg-white/10 text-text-primary' : 'hover:text-text-primary'
                      }`}
                    >
                      {m === 'escribir' ? 'Escribir' : 'Leer'}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  onClick={guardarSiHaceFalta}
                  disabled={!sucio || guardando}
                  className="cursor-pointer font-medium text-primary disabled:cursor-default disabled:opacity-40"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(true)}
                  className="cursor-pointer text-text-secondary hover:text-error"
                >
                  Eliminar
                </button>
              </span>
            )}
          </div>

          {confirmarBorrado && (
            <div className="flex flex-wrap items-center gap-3 font-sans text-xs">
              <span className="text-text-primary">
                ¿Eliminar «{documento.title}»? No se deshace.
              </span>
              <button
                type="button"
                disabled={borrando}
                onClick={() => {
                  const datos = new FormData();
                  datos.set('projectId', projectId);
                  datos.set('workspaceId', documento.workspaceId);
                  datos.set('documentId', documento.id);
                  borrar(datos);
                }}
                className="cursor-pointer font-semibold text-error disabled:opacity-50"
              >
                {borrando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmarBorrado(false)}
                className="cursor-pointer text-text-secondary"
              >
                No
              </button>
            </div>
          )}

          {(estado.error || estadoBorrado.error) && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 font-sans text-xs text-error"
            >
              <span>{estado.error ?? estadoBorrado.error}</span>
              {estado.conflicto && (
                <>
                  <button type="button" onClick={copiarLoMio} className="cursor-pointer underline">
                    {copiado ? 'Copiado' : 'Copiar lo mío'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBorrador(null);
                      setEnviado(null);
                      router.refresh();
                    }}
                    className="cursor-pointer underline"
                  >
                    Cargar su versión
                  </button>
                </>
              )}
            </div>
          )}
        </header>

        {canEdit && modo === 'escribir' ? (
          <textarea
            value={contenido}
            onChange={(e) => editar({ content: e.target.value })}
            onBlur={guardarSiHaceFalta}
            onKeyDown={alTeclear}
            maxLength={DOCUMENT_CONTENT_MAX}
            aria-label="Contenido del documento, en Markdown"
            placeholder={'Escribe en Markdown: # títulos, **negrita**, - listas, `código`…'}
            className="min-h-[50vh] w-full flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-text-primary outline-none placeholder:text-text-secondary"
          />
        ) : contenido.trim() ? (
          <div className="font-sans text-sm leading-relaxed text-text-primary">
            <ModelText texto={contenido} />
          </div>
        ) : (
          <p className="font-sans text-sm text-text-secondary">
            Vacío.{canEdit ? ' Pulsa «Escribir» para empezar.' : ''}
          </p>
        )}
      </div>
    </article>
  );
}
