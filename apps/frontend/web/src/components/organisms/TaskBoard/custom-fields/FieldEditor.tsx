'use client';

import { setTaskFieldValueAction } from '@/app/(privado)/projects/[id]/field-actions';
import {
  Avatar,
  type CustomField,
  type FieldInput,
  Select,
  SelectorDeFecha,
  type Task,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  fieldInputOf,
  fieldValueOf,
  personLabel,
} from '@praxis/commons';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FIELD_BOX, FIELD_OVERRIDE } from '../section-panel';
import { FieldValueView, OptionPill } from './FieldValueView';
import { useProjectFields } from './ProjectFieldsContext';
import { TokenPicker } from './TokenPicker';
import { swallowEscape } from './swallow-escape';

/**
 * El valor de un campo en una tarea, con guardado optimista.
 *
 * Lo que se ve cambia al instante y la petición va detrás; si falla, vuelve a
 * lo que había y lo dice. Cuando llega la tarea recargada del servidor —la
 * acción revalida la página—, manda lo del servidor.
 *
 * ⚠️ Se sincroniza por la **firma** del valor, no por la identidad del objeto:
 * cada render de la página trae objetos nuevos aunque digan lo mismo, y
 * resincronizar por identidad pisaba lo que se acababa de escribir mientras la
 * petición seguía en vuelo.
 */
export function useFieldValue(task: Task, field: CustomField) {
  const { projectId } = useProjectFields();
  const server = fieldInputOf(field, fieldValueOf(task, field.id));
  const signature = JSON.stringify(server);
  const [input, setInput] = useState<FieldInput>(server);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: la firma ES el valor del servidor; `server` es un objeto nuevo en cada render
  useEffect(() => {
    setInput(JSON.parse(signature) as FieldInput);
  }, [signature, task.id]);

  async function save(next: FieldInput) {
    if (JSON.stringify(next) === JSON.stringify(input)) return;
    const previous = input;
    setInput(next);
    setSaving(true);
    setError(null);
    const result = await setTaskFieldValueAction({
      projectId,
      taskId: task.id,
      fieldId: field.id,
      value: next,
    });
    setSaving(false);
    if (result.error) {
      setInput(previous);
      setError(result.error);
    }
  }

  return { input, save, saving, error };
}

/**
 * Edita el valor de un campo, según su tipo.
 *
 * Dos presentaciones:
 * - `inline`, en el panel de la tarea: el editor ocupa su fila, y las listas
 *   (selección múltiple, personas) se despliegan **dentro del panel** — no en un
 *   portal, porque el panel se cierra con cualquier clic fuera de él.
 * - `panel`, dentro del flotante de una celda de la tabla: ya está desplegado,
 *   así que las listas se pintan directamente.
 */
export function FieldEditor({
  field,
  input,
  onCommit,
  disabled = false,
  variant = 'inline',
  autoFocus = false,
  id,
}: {
  field: CustomField;
  input: FieldInput;
  onCommit: (value: FieldInput) => void;
  disabled?: boolean;
  variant?: 'inline' | 'panel';
  autoFocus?: boolean;
  /** Para que el nombre de la fila (`<label for>`) nombre al control. */
  id?: string;
}) {
  const { members, usersById } = useProjectFields();

  switch (field.type) {
    case 'TEXT':
    case 'URL':
    case 'NUMBER':
      return (
        <TextLikeEditor
          field={field}
          input={input}
          onCommit={onCommit}
          disabled={disabled}
          autoFocus={autoFocus}
          id={id}
          boxed={variant === 'inline'}
        />
      );

    case 'DATE':
      return (
        <SelectorDeFecha
          /* Remonta cuando cambia el valor desde fuera: el selector no se
             controla y, sin esto, seguiría enseñando la fecha anterior. */
          key={String(input)}
          name={`field-${field.id}`}
          label={field.name}
          hideLabel
          defaultValue={typeof input === 'string' ? input : ''}
          placeholder="Sin fecha"
          disabled={disabled}
          className={variant === 'inline' ? FIELD_OVERRIDE : ''}
          corto
          align="right"
          onValueChange={(value) => onCommit(value || null)}
        />
      );

    case 'CHECKBOX':
      return <CheckboxEditor field={field} input={input} onCommit={onCommit} disabled={disabled} />;

    case 'SELECT':
      /* En el panel, el mismo desplegable que Prioridad: una sola opción se
         elige igual en toda la tarea. En el flotante de la tabla, la lista. */
      if (variant === 'inline') {
        return (
          <Select
            id={id}
            className={FIELD_OVERRIDE}
            value={typeof input === 'string' ? input : ''}
            disabled={disabled}
            onValueChange={(value) => onCommit(value || null)}
            options={[
              { value: '', label: 'Sin valor' },
              ...field.options.map((o) => ({ value: o.id, label: o.name, color: colors[o.color] })),
            ]}
          />
        );
      }
      return (
        <OptionsEditor
          field={field}
          selected={typeof input === 'string' ? [input] : []}
          items={field.options.map((o) => ({
            id: o.id,
            label: o.name,
            render: <OptionPill name={o.name} color={colors[o.color]} />,
          }))}
          multiple={false}
          onChange={(ids) => onCommit(ids[0] ?? null)}
          disabled={disabled}
          variant={variant}
          summary={<FieldValueView field={field} input={input} usersById={usersById} />}
          emptyText="Este campo no tiene opciones todavía."
        />
      );

    case 'MULTI_SELECT':
      if (variant === 'inline') {
        return (
          <TokenPicker
            label={field.name}
            items={field.options.map((o) => ({
              id: o.id,
              label: o.name,
              tone: colors[o.color],
              leading: (
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: colors[o.color] }}
                />
              ),
            }))}
            selected={Array.isArray(input) ? input : []}
            onChange={(ids) => onCommit(ids)}
            disabled={disabled}
            placeholder="Añadir opción…"
            emptyText="Sin valor"
            noItemsText="Este campo no tiene opciones todavía."
          />
        );
      }
      return (
        <OptionsEditor
          field={field}
          selected={Array.isArray(input) ? input : []}
          items={field.options.map((o) => ({
            id: o.id,
            label: o.name,
            render: <OptionPill name={o.name} color={colors[o.color]} />,
          }))}
          multiple
          onChange={(ids) => onCommit(ids)}
          disabled={disabled}
          variant={variant}
          summary={<FieldValueView field={field} input={input} usersById={usersById} />}
          emptyText="Este campo no tiene opciones todavía."
        />
      );

    case 'PERSON':
      if (variant === 'inline') {
        return (
          <TokenPicker
            label={field.name}
            items={members.map((m) => ({
              id: m.id,
              label: personLabel(m),
              leading: (
                <Avatar
                  size="sm"
                  label={personLabel(m)}
                  src={avatarHref(m.avatarUrl, '/api/gateway')}
                />
              ),
            }))}
            selected={Array.isArray(input) ? input : []}
            onChange={(ids) => onCommit(ids)}
            disabled={disabled}
            placeholder="Añadir persona…"
            emptyText="Nadie"
            noItemsText="Este proyecto todavía no tiene a nadie a quien elegir."
          />
        );
      }
      return (
        <OptionsEditor
          field={field}
          selected={Array.isArray(input) ? input : []}
          items={members.map((m) => ({
            id: m.id,
            label: personLabel(m),
            render: <span className="truncate">{personLabel(m)}</span>,
          }))}
          multiple
          searchable={members.length > 6}
          onChange={(ids) => onCommit(ids)}
          disabled={disabled}
          variant={variant}
          summary={<FieldValueView field={field} input={input} usersById={usersById} />}
          emptyText="Este proyecto todavía no tiene a nadie a quien elegir."
        />
      );
  }
}

/** Texto, enlace y número: se escribe libre y se guarda al salir o con Enter. */
function TextLikeEditor({
  field,
  input,
  onCommit,
  disabled,
  autoFocus,
  id,
  boxed,
}: {
  field: CustomField;
  input: FieldInput;
  onCommit: (value: FieldInput) => void;
  disabled: boolean;
  autoFocus: boolean;
  id?: string;
  /** Con la caja de campo del panel (`FIELD_BOX`); sin ella en la tabla. */
  boxed: boolean;
}) {
  const initial = input === null ? '' : String(input);
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => setDraft(initial), [initial]);

  function commit() {
    const value = draft.trim();
    if (value === initial) return setProblem(null);
    if (!value) {
      setProblem(null);
      return onCommit(null);
    }
    if (field.type === 'NUMBER') {
      const number = Number(value.replace(',', '.'));
      if (!Number.isFinite(number)) return setProblem('Escribe un número.');
      setProblem(null);
      return onCommit(number);
    }
    if (field.type === 'URL' && !/^https?:\/\/\S+$/i.test(value)) {
      return setProblem('El enlace tiene que empezar por http:// o https://');
    }
    setProblem(null);
    onCommit(value);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        type={field.type === 'URL' ? 'url' : 'text'}
        inputMode={field.type === 'NUMBER' ? 'decimal' : undefined}
        id={id}
        aria-label={id ? undefined : field.name}
        aria-invalid={problem ? true : undefined}
        value={draft}
        disabled={disabled}
        // biome-ignore lint/a11y/noAutofocus: solo en el flotante de una celda, que se abrió para escribir aquí
        autoFocus={autoFocus}
        maxLength={field.type === 'URL' ? 2048 : 2000}
        placeholder={
          field.type === 'URL' ? 'https://…' : field.type === 'NUMBER' ? '0' : 'Escribe…'
        }
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            (event.target as HTMLInputElement).blur();
          }
          /* Con algo escrito, Escape lo deshace y se queda aquí: no cierra el
             panel de la tarea. Sin nada que deshacer, sigue su curso —cierra
             el panel, o el flotante de la tabla—, que es lo que se espera. */
          if (event.key === 'Escape' && (draft !== initial || problem)) {
            swallowEscape(event);
            setDraft(initial);
            setProblem(null);
          }
        }}
        className={[
          'h-10 w-full min-w-0 px-3 font-sans text-sm text-text-primary outline-none',
          'placeholder:text-text-secondary disabled:cursor-default disabled:px-0',
          /* En el panel, la caja de campo: si tiene caja, se toca. Sin permiso
             (`disabled`), el valor sin caja. En la tabla, el flotante ya es la caja. */
          boxed && !disabled
            ? FIELD_BOX
            : 'rounded-xl border border-white/[0.11] bg-white/[0.05] disabled:border-transparent disabled:bg-transparent',
          problem ? 'border-error!' : '',
          field.type === 'NUMBER' ? 'tabular-nums' : '',
        ].join(' ')}
      />
      {problem && (
        <p role="alert" className="font-sans text-xs text-error">
          {problem}
        </p>
      )}
    </div>
  );
}

function CheckboxEditor({
  field,
  input,
  onCommit,
  disabled,
}: {
  field: CustomField;
  input: FieldInput;
  onCommit: (value: FieldInput) => void;
  disabled: boolean;
}) {
  const on = input === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={field.name}
      disabled={disabled}
      onClick={() => onCommit(!on)}
      className={`flex min-h-10 w-full cursor-pointer items-center gap-2.5 px-3 text-left font-sans text-sm text-text-primary disabled:cursor-default disabled:px-0 ${disabled ? '' : FIELD_BOX}`}
    >
      <span
        aria-hidden="true"
        className="relative h-4 w-7 rounded-full transition-colors"
        style={{ background: on ? colors.primary : alpha(colors.textSecondary, 35) }}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left]"
          style={{ left: on ? '0.875rem' : '0.125rem' }}
        />
      </span>
      {on ? 'Sí' : 'No'}
    </button>
  );
}

type OptionItem = { id: string; label: string; render: React.ReactNode };

/**
 * Elegir una o varias de una lista: opciones de una selección, o personas.
 *
 * En el panel de la tarea, un botón con lo elegido que despliega la lista
 * debajo; en el flotante de la tabla, la lista ya abierta.
 */
function OptionsEditor({
  field,
  selected,
  items,
  multiple,
  searchable = false,
  onChange,
  disabled,
  variant,
  summary,
  emptyText,
}: {
  field: CustomField;
  selected: string[];
  items: OptionItem[];
  multiple: boolean;
  searchable?: boolean;
  onChange: (ids: string[]) => void;
  disabled: boolean;
  variant: 'inline' | 'panel';
  summary: React.ReactNode;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  /* Fuera de la lista, cierra. `pointerdown`, como el resto de desplegables. */
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  function toggle(id: string) {
    if (!multiple) {
      onChange(selected.includes(id) ? [] : [id]);
      setOpen(false);
      return;
    }
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const list = (
    <OptionList
      id={listId}
      label={field.name}
      items={items}
      selected={selected}
      multiple={multiple}
      searchable={searchable}
      onToggle={toggle}
      emptyText={emptyText}
    />
  );

  if (variant === 'panel') return list;

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          swallowEscape(event);
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${field.name}: cambiar`}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 w-full min-w-0 cursor-pointer items-center rounded-lg px-2.5 py-1.5 text-left font-sans text-sm text-text-primary transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {summary}
      </button>
      {open && (
        <div
          className="absolute right-0 left-0 z-30 mt-1 origin-top animate-desplegar-menu rounded-xl border border-border p-1"
          style={{
            background: colors.surfaceElevated,
            boxShadow: `0 12px 32px ${alpha(colors.overlay, 55)}`,
          }}
        >
          {list}
        </div>
      )}
    </div>
  );
}

/** La lista con sus casillas. Compartida por el panel y la tabla. */
export function OptionList({
  id,
  label,
  items,
  selected,
  multiple,
  searchable,
  onToggle,
  emptyText,
}: {
  id?: string;
  label: string;
  items: OptionItem[];
  selected: string[];
  multiple: boolean;
  searchable: boolean;
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return q ? items.filter((i) => i.label.toLocaleLowerCase('es').includes(q)) : items;
  }, [items, query]);

  if (items.length === 0) {
    return <p className="px-2 py-2 font-sans text-xs text-text-secondary">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {searchable && (
        <input
          type="search"
          aria-label={`Buscar en ${label}`}
          placeholder="Buscar…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 w-full rounded-md border border-border bg-surface px-2 font-sans text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-primary"
        />
      )}
      <ul id={id} aria-label={label} className="flex max-h-60 flex-col overflow-y-auto">
        {visible.map((item) => {
          const on = selected.includes(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(item.id)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left font-sans text-sm text-text-primary transition-colors hover:bg-white/5"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 ${
                    multiple ? 'rounded' : 'rounded-full'
                  } ${on ? 'border-primary bg-primary/25' : 'border-border-strong'}`}
                >
                  {on && <span className="text-[10px] leading-none text-primary">✓</span>}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.render}</span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-2 py-2 font-sans text-xs text-text-secondary">Nada coincide.</li>
        )}
      </ul>
    </div>
  );
}

/**
 * Un flotante pegado a un elemento y pintado en `document.body`.
 *
 * Para la tabla: sus celdas recortan lo que sobresale (`overflow-hidden`, con
 * `table-fixed`), así que un desplegable dentro de una celda saldría cortado.
 * ⚠️ **No sirve dentro del panel de la tarea**: el panel se cierra con
 * cualquier clic fuera de él, y un portal está fuera.
 */
export function AnchoredPanel({
  anchor,
  onClose,
  children,
  width = 288,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function place() {
      const rect = anchor.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight ?? 240;
      const below = rect.bottom + 4;
      /* Si no cabe debajo, se abre hacia arriba. */
      const top =
        below + height > window.innerHeight - 8 ? Math.max(8, rect.top - 4 - height) : below;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPosition({ top, left });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, width]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 origin-top animate-desplegar-menu rounded-xl border border-border p-2"
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width,
        background: colors.surfaceElevated,
        boxShadow: `0 12px 32px ${alpha(colors.overlay, 55)}`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Para un `UserProfile` que pueda no estar: el nombre, o un aviso. */
export function nameOf(usersById: Map<string, UserProfile>, userId: string): string {
  const user = usersById.get(userId);
  return user ? personLabel(user) : 'Alguien que ya no está';
}
