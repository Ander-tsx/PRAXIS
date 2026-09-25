'use client';

import { Button, Dialog, ModelText, type UserProfile, personLabel } from '@praxis/commons';
import { markdownAJson } from '@praxis/editor-schema';
import type { Editor } from '@tiptap/core';
import { History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { rutaDeDocumento } from './contexto';

interface Version {
  id: string;
  title: string;
  authorIds: string[];
  createdAt: string;
}

const cuando = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Las versiones del documento (E5 de `docs/PLAN-DOCUMENTOS.md`): una cada diez
 * minutos de escritura, o cuando cambia quién escribe.
 *
 * Restaurar **entra por el editor**: la versión sustituye al contenido como un
 * cambio más, que los demás ven llegar en vivo y que se puede deshacer. No se
 * reescribe la base por detrás, que dejaría a quien tiene el documento abierto
 * escribiendo sobre algo que ya no existe.
 */
export function HistorialDeVersiones({
  documentId,
  k,
  editor,
  usersById,
}: {
  documentId: string;
  k: string | null;
  editor: Editor | null;
  usersById?: Map<string, UserProfile>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [elegida, setElegida] = useState<{ id: string; content: string } | null>(null);

  useEffect(() => {
    if (!abierto) return;
    fetch(rutaDeDocumento(documentId, '/revisions', k))
      .then((r) => r.json())
      .then((c) => setVersiones(c?.data ?? []))
      .catch(() => setVersiones([]));
  }, [abierto, documentId, k]);

  function ver(id: string) {
    fetch(rutaDeDocumento(documentId, `/revisions/${id}`, k))
      .then((r) => r.json())
      .then((c) => c?.data && setElegida({ id, content: c.data.content }));
  }

  function restaurar() {
    if (!editor || !elegida) return;
    editor.chain().focus().setContent(markdownAJson(elegida.content)).run();
    setAbierto(false);
    setElegida(null);
  }

  const autores = (ids: string[]) =>
    ids
      .map((id) => usersById?.get(id))
      .filter((u): u is UserProfile => !!u)
      .map(personLabel)
      .join(', ');

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Historial de versiones"
        aria-label="Historial de versiones"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white/[0.07] hover:text-text-primary"
      >
        <History className="h-4 w-4" />
      </button>
      <Dialog
        tone="dark"
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Historial"
        size="xl"
      >
        <div className="grid min-h-[50vh] gap-4 sm:grid-cols-[14rem_1fr]">
          <ul className="flex flex-col border-border sm:border-r sm:pr-3">
            {versiones === null && (
              <li className="font-sans text-sm text-text-secondary">Cargando…</li>
            )}
            {versiones?.length === 0 && (
              <li className="font-sans text-sm text-text-secondary">Todavía no hay versiones.</li>
            )}
            {versiones?.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => ver(v.id)}
                  className={`flex w-full cursor-pointer flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors ${
                    elegida?.id === v.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="font-sans text-sm text-text-primary">
                    {cuando.format(new Date(v.createdAt))}
                  </span>
                  <span className="truncate font-sans text-[11px] text-text-secondary">
                    {autores(v.authorIds) || v.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-col gap-4">
            {elegida ? (
              <>
                <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-border p-4">
                  <ModelText texto={elegida.content} />
                </div>
                {editor?.isEditable && (
                  <div>
                    <Button size="sm" onClick={restaurar}>
                      Restaurar esta versión
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="font-sans text-sm text-text-secondary">Elige una versión para verla.</p>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
