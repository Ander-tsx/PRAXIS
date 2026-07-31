'use client';

import {
  Button,
  Input,
  LABEL_COLORS,
  LABEL_COLOR_LABELS,
  type Label,
  type LabelColor,
  Select,
  alpha,
  colors,
} from '@praxis/commons';
import { useActionState, useEffect, useRef, useState } from 'react';
import { deleteLabelAction, saveLabelAction } from '@/app/(private)/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/action-state';

export interface ProjectLabelsProps {
  projectId: string;
  labels: Label[];
  canManage: boolean;
}

/** El token de color de una etiqueta, resuelto a su variable CSS. */
export function labelColor(color: LabelColor): string {
  return colors[color];
}

/**
 * Etiquetas del proyecto.
 *
 * Van en su propia pestaña y no dentro del diálogo de tarea: crear una etiqueta
 * desde ahí obligaría a anidar un formulario dentro de otro, y además son
 * configuración del proyecto —se definen una vez y se usan muchas—, no algo que
 * se improvise por tarea.
 *
 * ⚠️ Gestionarlas exige `canEditTask`; no hay un permiso propio de etiquetas.
 */
export function ProjectLabels({ projectId, labels, canManage }: ProjectLabelsProps) {
  const [editing, setEditing] = useState<Label | null>(null);
  const [state, formAction, pending] = useActionState(saveLabelAction, TASK_INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  /** Al confirmar el servidor: se limpia el formulario y se sale de edición. */
  useEffect(() => {
    if (state.done) {
      formRef.current?.reset();
      setEditing(null);
    }
  }, [state.done]);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-2xl text-text-primary">Etiquetas</h3>
        <p className="font-sans text-sm text-text-secondary">
          Son del proyecto entero: la misma etiqueta sirve en todos sus tableros.
        </p>
      </header>

      {labels.length === 0 ? (
        <p className="rounded-2xl bg-surface px-5 py-8 text-center font-sans text-sm text-text-secondary">
          Todavía no hay etiquetas.{' '}
          {canManage ? 'Crea la primera abajo.' : 'Quien edite tareas puede crearlas.'}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <li key={label.id}>
              <LabelChip
                label={label}
                canManage={canManage}
                projectId={projectId}
                onEdit={() => setEditing(label)}
                isEditing={editing?.id === label.id}
              />
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form
          ref={formRef}
          action={formAction}
          /* `key` remonta el formulario al cambiar de etiqueta: los campos son
             no controlados y si no conservarían los valores de la anterior. */
          key={editing?.id ?? 'nueva'}
          className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface p-4"
          noValidate
        >
          <input type="hidden" name="projectId" value={projectId} />
          {editing && <input type="hidden" name="labelId" value={editing.id} />}

          <span className="min-w-48 flex-1">
            <Input
              name="name"
              label={editing ? `Editando «${editing.name}»` : 'Nueva etiqueta'}
              defaultValue={editing?.name ?? ''}
              placeholder="frontend, bug, diseño…"
              maxLength={40}
              fullWidth
            />
          </span>

          <span className="w-40">
            <Select
              name="color"
              label="Color"
              defaultValue={editing?.color ?? 'primary'}
              options={LABEL_COLORS.map((color) => ({
                value: color,
                label: LABEL_COLOR_LABELS[color],
              }))}
              fullWidth
            />
          </span>

          <Button type="submit" disabled={pending}>
            {pending ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}
          </Button>

          {editing && (
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          )}
        </form>
      )}

      {state.error && (
        <p role="alert" className="font-sans text-sm" style={{ color: colors.error }}>
          {state.error}
        </p>
      )}
    </section>
  );
}

function LabelChip({
  label,
  canManage,
  projectId,
  onEdit,
  isEditing,
}: {
  label: Label;
  canManage: boolean;
  projectId: string;
  onEdit: () => void;
  isEditing: boolean;
}) {
  const [state, deleteAction, deleting] = useActionState(deleteLabelAction, TASK_INITIAL_STATE);
  const [confirming, setConfirming] = useState(false);
  const tone = labelColor(label.color);

  return (
    <span
      className="flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 font-sans text-xs"
      style={{
        background: alpha(tone, 15),
        color: tone,
        outline: isEditing ? `1px solid ${tone}` : 'none',
      }}
    >
      {label.name}

      {canManage && !confirming && (
        <>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar la etiqueta ${label.name}`}
            title="Editar"
            className="cursor-pointer rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Eliminar la etiqueta ${label.name}`}
            title="Eliminar"
            className="cursor-pointer rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </>
      )}

      {confirming && (
        /* Se avisa de que desaparece de las tareas: la relación cascadea y
           borrarla en silencio quitaría información sin decirlo. */
        <form action={deleteAction} className="flex items-center gap-1">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="labelId" value={label.id} />
          <span className="text-[10px] opacity-80">se quita de sus tareas</span>
          <button
            type="submit"
            disabled={deleting}
            className="cursor-pointer rounded px-1 font-semibold underline disabled:opacity-50"
          >
            {deleting ? '…' : 'Sí'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="cursor-pointer rounded px-1 opacity-70"
          >
            No
          </button>
        </form>
      )}

      {state.error && <span className="text-[10px]">{state.error}</span>}
    </span>
  );
}
