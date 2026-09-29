'use client';

import { Button } from '@praxis/commons';
import { claveDeRevisionDePrax } from '@praxis/commons/api/assistant';
import { markdownAJson } from '@praxis/editor-schema';
import type { Editor } from '@tiptap/core';
import { useEffect, useState } from 'react';

/**
 * La revisión que PRAX propuso para este documento, esperando a que alguien la
 * aplique (F7 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Por qué la aplica el editor y no la tarjeta
 *
 * El contenido de un documento solo se escribe por el tiempo real (E4 de
 * PLAN-DOCUMENTOS): un `PATCH` de texto se lo comería el siguiente guardado de
 * Yjs de quien lo tenga abierto. Así que la tarjeta del chat deja la revisión
 * en `sessionStorage` y abre el documento, y aquí se aplica **igual que se
 * restaura una versión** (`HistorialDeVersiones`): un cambio más, que los demás
 * ven llegar y que queda en el historial.
 *
 * Solo se ofrece a quien puede editar, y solo con el documento sincronizado:
 * aplicarlo antes de que llegue el estado del servidor sería escribir sobre un
 * documento vacío.
 */
export function RevisionDePrax({ documentId, editor }: { documentId: string; editor: Editor }) {
  const [revision, setRevision] = useState<{ contenido: string; cambios: string } | null>(null);

  useEffect(() => {
    try {
      const guardada = sessionStorage.getItem(claveDeRevisionDePrax(documentId));
      if (guardada) setRevision(JSON.parse(guardada));
    } catch {
      /* Sin almacenamiento (ventana privada estricta): no hay revisión que ofrecer. */
    }
  }, [documentId]);

  if (!revision) return null;

  function olvidar() {
    try {
      sessionStorage.removeItem(claveDeRevisionDePrax(documentId));
    } catch {
      /* Nada que hacer: se va igual al cerrar la pestaña. */
    }
    setRevision(null);
  }

  function aplicar() {
    if (!revision) return;
    editor.chain().focus().setContent(markdownAJson(revision.contenido)).run();
    olvidar();
  }

  return (
    <aside
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3"
      data-tone="dark"
    >
      <p className="font-sans text-xs uppercase tracking-wider text-text-secondary">
        Revisión propuesta por PRAX
      </p>
      <p className="font-sans text-sm text-text-primary">{revision.cambios}</p>
      <p className="font-sans text-xs text-text-secondary">
        Sustituye el contenido actual. Queda en el historial de versiones, así que se puede volver
        atrás.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={aplicar}>
          Aplicar la revisión
        </Button>
        <Button size="sm" variant="ghost" onClick={olvidar}>
          Descartar
        </Button>
      </div>
    </aside>
  );
}
