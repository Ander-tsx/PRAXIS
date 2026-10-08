'use client';

import {
  deleteCustomFieldAction,
  saveCustomFieldAction,
} from '@/app/(privado)/projects/[id]/field-actions';
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomField,
  type CustomFieldType,
  LABEL_COLORS,
  LABEL_COLOR_LABELS,
  type LabelColor,
  Select,
  colors,
  fieldTakesOptions,
} from '@praxis/commons';
import { useId, useState } from 'react';
import { useProjectFields } from './ProjectFieldsContext';
import { swallowEscape } from './swallow-escape';

type DraftOption = { key: string; id?: string; name: string; color: LabelColor };

/** Qué aparece en el desplegable de tipos, con una pista de para qué sirve. */
const TYPE_HINTS: Record<CustomFieldType, string> = {
  TEXT: 'Una línea libre',
  NUMBER: 'Una cantidad: horas, coste, versión…',
  DATE: 'Un día del calendario',
  SELECT: 'Una de varias opciones',
  MULTI_SELECT: 'Varias de varias opciones',
  PERSON: 'Gente del proyecto, como un revisor',
  CHECKBOX: 'Sí o no',
  URL: 'Un enlace: un PR, un diseño, un ticket',
};

let draftKeys = 0;
const nextKey = () => `o${++draftKeys}`;

/**
 * Crear un campo o editar uno que ya existe.
 *
 * El **tipo solo se elige al crear**: el valor guardado se interpreta según el
 * tipo, y cambiarlo dejaría las tareas con datos que no significan nada.
 *
 * Borrar se confirma diciendo qué se pierde: el valor en todas las tareas.
 */
export function FieldSettings({
  field,
  onDone,
}: {
  /** Sin campo, se crea uno nuevo. */
  field?: CustomField;
  onDone: () => void;
}) {
  const { projectId } = useProjectFields();
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<CustomFieldType>(field?.type ?? 'TEXT');
  const [showOnCard, setShowOnCard] = useState(field?.showOnCard ?? false);
  const [options, setOptions] = useState<DraftOption[]>(() =>
    field && field.options.length > 0
      ? field.options.map((o) => ({ key: nextKey(), id: o.id, name: o.name, color: o.color }))
      : [
          { key: nextKey(), name: '', color: 'primary' },
          { key: nextKey(), name: '', color: 'success' },
        ],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const tipoId = useId();

  const withOptions = fieldTakesOptions(type);

  async function save() {
    setPending(true);
    setError(null);
    const result = await saveCustomFieldAction({
      projectId,
      fieldId: field?.id,
      name,
      type,
      showOnCard,
      /* Las filas en blanco se ignoran: la lista empieza con dos huecos. */
      options: withOptions
        ? options
            .filter((o) => o.name.trim())
            .map((o) => ({ id: o.id, name: o.name, color: o.color }))
        : [],
    });
    setPending(false);
    if (result.error) return setError(result.error);
    onDone();
  }

  async function remove() {
    if (!field) return;
    setPending(true);
    setError(null);
    const result = await deleteCustomFieldAction({ projectId, fieldId: field.id });
    setPending(false);
    if (result.error) return setError(result.error);
    onDone();
  }

  return (
    <div
      className="flex flex-col gap-3 font-sans"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          /* Cierra esto y no el panel de la tarea, que escucha en el documento. */
          swallowEscape(event);
          onDone();
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">Nombre</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: se abre para escribir el nombre
          autoFocus
          value={name}
          maxLength={40}
          placeholder="Reviewer, Cliente, Versión…"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void save();
            }
          }}
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-primary"
        />
      </label>

      {field ? (
        <p className="text-xs text-text-secondary">
          Tipo: <span className="text-text-primary">{CUSTOM_FIELD_TYPE_LABELS[field.type]}</span>
          <span className="block text-[11px]">
            El tipo no se cambia; para otro, crea un campo nuevo.
          </span>
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {/* El rótulo es nuestro y no el del átomo, para que «Tipo» se lea
              igual que «Nombre» de arriba y no con otro cuerpo y otro color. */}
          <label htmlFor={tipoId} className="text-xs font-medium text-text-secondary">
            Tipo
          </label>
          <Select
            id={tipoId}
            value={type}
            onValueChange={(value) => setType(value as CustomFieldType)}
            options={CUSTOM_FIELD_TYPES.map((t) => ({
              value: t,
              label: CUSTOM_FIELD_TYPE_LABELS[t],
            }))}
          />
          <span className="text-[11px] text-text-secondary">{TYPE_HINTS[type]}</span>
        </div>
      )}

      {withOptions && (
        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium text-text-secondary">Opciones</legend>
          {options.map((option, index) => (
            <div key={option.key} className="flex items-center gap-1.5">
              <ColorDot
                color={option.color}
                onChange={(color) =>
                  setOptions((all) => all.map((o) => (o.key === option.key ? { ...o, color } : o)))
                }
              />
              <input
                aria-label={`Opción ${index + 1}`}
                value={option.name}
                maxLength={40}
                placeholder={`Opción ${index + 1}`}
                onChange={(event) =>
                  setOptions((all) =>
                    all.map((o) => (o.key === option.key ? { ...o, name: event.target.value } : o)),
                  )
                }
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-primary"
              />
              <button
                type="button"
                aria-label={`Quitar la opción ${option.name || index + 1}`}
                onClick={() => setOptions((all) => all.filter((o) => o.key !== option.key))}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setOptions((all) => [
                ...all,
                {
                  key: nextKey(),
                  name: '',
                  color: LABEL_COLORS[all.length % LABEL_COLORS.length],
                },
              ])
            }
            className="w-fit cursor-pointer text-xs text-text-secondary hover:text-text-primary"
          >
            + Añadir opción
          </button>
          {field && (
            <span className="text-[11px] text-text-secondary">
              Quitar una opción la borra de las tareas que la tenían.
            </span>
          )}
        </fieldset>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={showOnCard}
          onChange={(event) => setShowOnCard(event.target.checked)}
          className="h-4 w-4 accent-[var(--color-primary)]"
        />
        Mostrar en la tarjeta del tablero
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-error/10 p-2 text-xs text-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        {field ? (
          confirmingDelete ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-text-secondary">
                ¿Borrar y vaciarlo en todas las tareas?
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => void remove()}
                className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-error hover:bg-error/10 disabled:opacity-50"
              >
                Sí, borrar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="cursor-pointer rounded-md px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="cursor-pointer text-xs text-text-secondary hover:text-error"
            >
              Eliminar campo
            </button>
          )
        ) : (
          <span />
        )}
        {!confirmingDelete && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onDone}
              className="cursor-pointer rounded-md px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void save()}
              className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? 'Guardando…' : field ? 'Guardar' : 'Crear campo'}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/** El punto de color de una opción: al pulsarlo pasa al siguiente color. */
function ColorDot({ color, onChange }: { color: LabelColor; onChange: (c: LabelColor) => void }) {
  const next = LABEL_COLORS[(LABEL_COLORS.indexOf(color) + 1) % LABEL_COLORS.length];
  return (
    <button
      type="button"
      aria-label={`Color ${LABEL_COLOR_LABELS[color]}; pulsa para cambiarlo`}
      title={LABEL_COLOR_LABELS[color]}
      onClick={() => onChange(next)}
      className="h-5 w-5 shrink-0 cursor-pointer rounded-full ring-1 ring-inset ring-black/20"
      style={{ background: colors[color] }}
    />
  );
}
