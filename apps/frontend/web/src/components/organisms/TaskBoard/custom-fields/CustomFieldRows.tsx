'use client';

import type { CustomField, Task } from '@praxis/commons';
import { useState } from 'react';
import { FieldEditor, useFieldValue } from './FieldEditor';
import { FieldSettings } from './FieldSettings';
import { useProjectFields } from './ProjectFieldsContext';
import { PropertyGroup, PropertyRow } from './PropertyRow';
import { FieldTypeIcon } from './property-icons';

/**
 * Los campos personalizados del proyecto, como filas del panel de la tarea, y
 * el «+ Añadir campo» de debajo.
 *
 * Gestionar campos y escribir valores piden lo mismo, `canEditTask` (D2), así
 * que quien ve el engranaje también puede rellenarlos.
 */
export function CustomFieldRows({ task, readOnly }: { task: Task; readOnly: boolean }) {
  const { fields, canEdit } = useProjectFields();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const manage = canEdit && !readOnly;

  if (fields.length === 0 && !manage) return null;

  return (
    <PropertyGroup
      title="Campos del proyecto"
      action={
        manage &&
        editing !== 'new' && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-xs text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
          >
            <span aria-hidden="true" className="text-sm leading-none">
              +
            </span>
            Añadir campo
          </button>
        )
      }
    >
      {fields.length === 0 && editing !== 'new' && (
        /* El hueco vacío explica para qué sirve, en vez de quedarse en blanco. */
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex cursor-pointer flex-col items-start gap-0.5 rounded-lg px-3 py-3 text-left font-sans transition-colors hover:bg-white/[0.03]"
        >
          <span className="text-sm text-text-primary">
            Añade lo que este proyecto necesite anotar
          </span>
          <span className="text-xs text-text-secondary">
            Un revisor, un cliente, una versión… Cada campo vale para todas las tareas del proyecto.
          </span>
        </button>
      )}

      {fields.map((field) =>
        editing === field.id ? (
          <SettingsBox key={field.id}>
            <FieldSettings field={field} onDone={() => setEditing(null)} />
          </SettingsBox>
        ) : (
          <CustomFieldRow
            key={field.id}
            task={task}
            field={field}
            readOnly={readOnly}
            onEdit={manage ? () => setEditing(field.id) : undefined}
          />
        ),
      )}

      {editing === 'new' && (
        <SettingsBox>
          <FieldSettings onDone={() => setEditing(null)} />
        </SettingsBox>
      )}
    </PropertyGroup>
  );
}

function CustomFieldRow({
  task,
  field,
  readOnly,
  onEdit,
}: {
  task: Task;
  field: CustomField;
  readOnly: boolean;
  onEdit?: () => void;
}) {
  const { input, save, saving, error } = useFieldValue(task, field);
  return (
    <PropertyRow
      label={field.name}
      icon={<FieldTypeIcon type={field.type} />}
      action={
        onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Configurar el campo ${field.name}`}
            title="Configurar el campo"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
          >
            <GearIcon />
          </button>
        )
      }
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <FieldEditor field={field} input={input} onCommit={save} disabled={readOnly} />
        {(saving || error) && (
          <span
            role={error ? 'alert' : undefined}
            aria-live="polite"
            className={`px-2.5 font-sans text-[11px] ${error ? 'text-error' : 'text-text-secondary'}`}
          >
            {error ?? 'Guardando…'}
          </span>
        )}
      </div>
    </PropertyRow>
  );
}

function SettingsBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-1 origin-top animate-desplegar-menu rounded-lg border border-border bg-surface p-3">
      {children}
    </div>
  );
}

function GearIcon() {
  return (
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
        d="M10.3 4.3c.4-1.7 2.9-1.7 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.5 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.6-1c-1.5.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 0 0 1-2.5c-.9-1.6.9-3.3 2.4-2.4a1.7 1.7 0 0 0 2.6-1.1z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
