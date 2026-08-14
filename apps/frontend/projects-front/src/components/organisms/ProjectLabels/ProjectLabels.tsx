'use client';

import { deleteLabelAction, saveLabelAction } from '@/app/(private)/[id]/actions';
import { TASK_INITIAL_STATE } from '@/lib/action-state';
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
  }, [state]);

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
        /* Una lista, no una nube de chips: los chips son el formato con el que
           la etiqueta se **usa** —en la tarjeta, en el diálogo—, donde tiene que
           ocupar poco. Esta pestaña es donde se **administra**, y ahí hace falta
           un renglón por etiqueta con sitio para su nombre y sus dos acciones.
           Apretados en una nube, los botones acababan en 12 px pegados al texto. */
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
          {labels.map((label) => (
            <li key={label.id}>
              <LabelRow
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
              /* La razón de tener un select propio: elegir «el rojo» leyendo
                 la palabra «Rojo» era lo que había antes. */
              options={LABEL_COLORS.map((color) => ({
                value: color,
                label: LABEL_COLOR_LABELS[color],
                color: labelColor(color),
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

/**
 * Una etiqueta en la pestaña que las administra.
 *
 * Enseña la etiqueta **tal como se verá** —su píldora, con su color— y al lado
 * las dos acciones, ya con tamaño de botón de verdad (32 px) en vez de los
 * iconos de 12 px pegados al texto que había antes.
 *
 * El de borrar es una **papelera**, no una «×». La cruz se lee como «quitar de
 * aquí» y esto no quita nada de una tarea: borra la etiqueta del proyecto y la
 * arranca de todas las tareas que la tuvieran. El icono tiene que prometer eso.
 */
function LabelRow({
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
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
      style={{ background: isEditing ? alpha(tone, 8) : undefined }}
    >
      {/* Cuadro de color aparte de la píldora: es lo que se recorre con la
          vista para encontrar una etiqueta en una lista larga, y dentro de la
          píldora el color queda diluido al 15 %. */}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: alpha(tone, 15) }}
        aria-hidden="true"
      >
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: tone }} />
      </span>

      <span
        className="rounded-full px-3 py-1 font-sans text-sm font-medium"
        style={{ background: alpha(tone, 15), color: tone }}
      >
        {label.name}
      </span>

      {isEditing && (
        <span className="font-sans text-xs" style={{ color: tone }}>
          editando
        </span>
      )}

      {canManage && !confirming && (
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton onClick={onEdit} label={`Editar la etiqueta ${label.name}`} title="Editar">
            <PencilIcon />
          </IconButton>
          <IconButton
            onClick={() => setConfirming(true)}
            label={`Eliminar la etiqueta ${label.name}`}
            title="Eliminar"
            danger
          >
            <TrashIcon />
          </IconButton>
        </span>
      )}

      {confirming && (
        /* Se avisa de que desaparece de las tareas: la relación cascadea y
           borrarla en silencio quitaría información sin decirlo. */
        <form action={deleteAction} className="ml-auto flex items-center gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="labelId" value={label.id} />
          <span className="font-sans text-xs text-text-secondary">Se quitará de sus tareas.</span>
          <button
            type="submit"
            disabled={deleting}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: alpha(colors.error, 20), color: colors.error }}
          >
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="cursor-pointer rounded-lg px-2 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            No
          </button>
        </form>
      )}

      {state.error && (
        <p role="alert" className="w-full font-sans text-xs" style={{ color: colors.error }}>
          {state.error}
        </p>
      )}
    </div>
  );
}

/** Botón cuadrado de 36 px para las acciones de una fila. */
function IconButton({
  onClick,
  label,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  title: string;
  /** El borrado se tiñe de rojo al apuntarlo, no antes: en reposo sería alarma constante. */
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className={[
        'flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl',
        'text-text-secondary transition-colors hover:bg-surface-elevated',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        danger ? 'hover:text-error' : 'hover:text-text-primary',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/* Heroicons v2 «pencil-square», con trazo de 1.5: el lápiz que había era el de
   la v1 a grosor 2, que a este tamaño se ve tosco y macizo. */
function PencilIcon() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
      />
    </svg>
  );
}

/* Heroicons v2 «trash». */
function TrashIcon() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}
