'use client';

import {
  COLUMN_COLORS,
  COLUMN_COLOR_LABELS,
  DONE_COLUMN_COLOR,
  type ColumnColor,
  alpha,
  colors,
} from '@praxis/commons';
import { useActionState, useEffect, useRef, useState } from 'react';
import { deleteColumnAction, updateColumnAction } from '@/app/[id]/actions';
import { COLUMN_INITIAL_STATE } from '@/lib/action-state';
import { COLUMN_NAME_MAX } from '@/lib/validation';

export interface ColumnMenuProps {
  boardId: string;
  projectId: string;
  columnId: string;
  columnName: string;
  columnColor: ColumnColor;
  /** Cuántas tareas tiene dentro: decide si el borrado pide confirmación. */
  taskCount: number;
  /** Renombrar y recolorear: `canEditColumn`. */
  canEdit: boolean;
  /** Eliminar: `canDeleteColumn`. */
  canDelete: boolean;
  /**
   * Avisa de que el menú está abierto.
   *
   * La columna es `draggable`, y dentro de un ancestro arrastrable el navegador
   * no deja seleccionar texto con el ratón: el campo de renombrar quedaba
   * inservible para corregir una letra. Quien nos monta desactiva el arrastre
   * mientras esto esté abierto.
   */
  onOpenChange: (open: boolean) => void;
}

/** Vista actual del panel. Una sola cosa a la vez: es un menú, no un formulario. */
type View = 'menu' | 'color' | 'rename' | 'delete';

/**
 * Menú de una columna: color, renombrar y eliminar.
 *
 * Sustituye a la «×» que borraba directo. Un botón de borrado permanente al lado
 * del nombre, sin confirmación y a un clic del gesto de arrastrar, es una trampa:
 * con el arreglo de esta misma sesión el borrado se lleva además las tareas de
 * dentro, así que ahora pregunta cuando hay algo que perder.
 *
 * **La confirmación solo aparece si la columna tiene tareas**, y dice cuántas se
 * van. Preguntar por una columna vacía es ceremonia sin riesgo.
 *
 * Cada acción es su propio `<form>`, como en el checklist y por lo mismo: van
 * dentro del árbol de una columna arrastrable, no anidados en otro formulario, y
 * así el `pending` de cada una es suyo.
 */
export function ColumnMenu({
  boardId,
  projectId,
  columnId,
  columnName,
  columnColor,
  taskCount,
  canEdit,
  canDelete,
  onOpenChange,
}: ColumnMenuProps) {
  const [view, setView] = useState<View | null>(null);
  const [name, setName] = useState(columnName);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const deleteFormRef = useRef<HTMLFormElement>(null);

  const [updateState, updateAction, updating] = useActionState(
    updateColumnAction,
    COLUMN_INITIAL_STATE,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteColumnAction,
    COLUMN_INITIAL_STATE,
  );

  const open = view !== null;

  /**
   * Cambia de vista y avisa al padre en el mismo sitio.
   *
   * Avisar desde un `useEffect` obligaba a llevar `onOpenChange` en sus
   * dependencias, y como llega como closure nueva en cada render el efecto se
   * disparaba constantemente. Aquí solo se avisa cuando de verdad cambia.
   */
  function show(next: View | null) {
    setView(next);
    onOpenChange(next !== null);
  }

  function close() {
    show(null);
    setName(columnName);
  }

  /**
   * Cierra al confirmar el servidor, no al enviar: si falla, el panel sigue
   * abierto con el mensaje y lo escrito dentro.
   */
  useEffect(() => {
    if (updateState.savedName) close();
  }, [updateState.savedName]);

  /** Escape y clic fuera. Los dos devuelven el foco al disparador. */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      close();
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /** El campo de renombrar llega enfocado y con el nombre seleccionado. */
  useEffect(() => {
    if (view === 'rename') {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [view]);

  // Sin ninguno de los dos permisos no hay menú que enseñar.
  if (!canEdit && !canDelete) return null;

  const error = updateState.error ?? deleteState.error;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      /* El menú vive dentro de una columna arrastrable: sin esto, empezar a
         escribir o pulsar un color podía arrancar el arrastre de la columna. */
      draggable={false}
      onDragStart={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : show('menu'))}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Opciones de la columna ${columnName}`}
        title="Opciones"
        className="cursor-pointer rounded p-1 text-text-disabled transition-colors hover:text-text-primary"
        style={{ color: open ? colors.textPrimary : undefined }}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div
          /* Sin `role="menu"` a propósito: ese rol promete navegación con
             flechas, y el panel se convierte en un formulario según la vista.
             Un rol mal cumplido estorba más que no declararlo. */
          aria-label={`Opciones de la columna ${columnName}`}
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl p-1.5"
          style={{
            background: colors.surfaceElevated,
            boxShadow: `0 12px 32px ${alpha(colors.overlay, 55)}, 0 0 0 1px ${alpha(colors.border, 70)}`,
          }}
        >
          {view === 'menu' && (
            <>
              {canEdit && (
                <>
                  <MenuItem onClick={() => show('color')}>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: colors[columnColor] }}
                      aria-hidden="true"
                    />
                    Cambiar color
                    {columnColor === DONE_COLUMN_COLOR && (
                      <span className="ml-auto font-sans text-[10px] text-text-disabled">
                        cierre
                      </span>
                    )}
                  </MenuItem>
                  <MenuItem onClick={() => show('rename')}>
                    <PencilIcon />
                    Renombrar
                  </MenuItem>
                </>
              )}
              {canDelete && (
                <MenuItem
                  tone={colors.error}
                  onClick={() => {
                    /* Sin tareas dentro no hay nada que perder: se borra
                       directo. La confirmación existe para decir cuántas se
                       van, y con cero no dice nada. */
                    if (taskCount === 0) {
                      deleteFormRef.current?.requestSubmit();
                      return;
                    }
                    show('delete');
                  }}
                >
                  <TrashIcon />
                  Eliminar
                </MenuItem>
              )}
            </>
          )}

          {view === 'color' && (
            <form action={updateAction} className="flex flex-col gap-2 p-1.5">
              <input type="hidden" name="boardId" value={boardId} />
              <input type="hidden" name="columnId" value={columnId} />
              <input type="hidden" name="projectId" value={projectId} />

              <span className="font-sans text-[11px] uppercase tracking-wide text-text-disabled">
                Color del punto
              </span>

              {/* Botones de envío con `value`: el color elegido es el del botón
                  pulsado, así que no hace falta estado ni un paso de guardar. */}
              <div className="flex flex-wrap gap-1.5">
                {COLUMN_COLORS.map((option) => (
                  <button
                    key={option}
                    type="submit"
                    name="color"
                    value={option}
                    disabled={updating}
                    aria-label={COLUMN_COLOR_LABELS[option]}
                    aria-current={option === columnColor}
                    title={COLUMN_COLOR_LABELS[option]}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: alpha(colors[option], 20),
                      boxShadow:
                        option === columnColor ? `0 0 0 1.5px ${colors[option]}` : undefined,
                    }}
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: colors[option] }}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>

              {/**
               * El verde no es solo un color y hay que decirlo **donde se
               * elige**, no en la documentación: una tarea que llega a una
               * columna verde deja de contar como pendiente en el panel. Por eso
               * va el último de la fila, separado del resto por su significado.
               */}
              <span
                className="flex items-start gap-1.5 rounded-lg p-1.5 font-sans text-[11px] leading-snug"
                style={{
                  background: alpha(colors[DONE_COLUMN_COLOR], 10),
                  color: colors.textSecondary,
                }}
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: colors[DONE_COLUMN_COLOR] }}
                  aria-hidden="true"
                />
                <span>
                  El verde marca la columna de cierre: sus tareas dejan de contar como
                  pendientes.
                </span>
              </span>

              <MenuBack onClick={() => show('menu')} />
            </form>
          )}

          {view === 'rename' && (
            <form action={updateAction} className="flex flex-col gap-2 p-1.5" noValidate>
              <input type="hidden" name="boardId" value={boardId} />
              <input type="hidden" name="columnId" value={columnId} />
              <input type="hidden" name="projectId" value={projectId} />

              <label
                htmlFor={`rename-${columnId}`}
                className="font-sans text-[11px] uppercase tracking-wide text-text-disabled"
              >
                Nombre
              </label>
              <input
                ref={nameRef}
                id={`rename-${columnId}`}
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={COLUMN_NAME_MAX}
                autoComplete="off"
                /* Enter guarda, igual que en el campo de tarea nueva y por lo
                   mismo: es la tecla natural aquí y no se deja al envío
                   implícito del navegador. */
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    name.trim() &&
                    name.trim() !== columnName &&
                    !updating
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                className="h-9 rounded-lg border border-border bg-surface px-2.5 font-sans text-sm text-text-primary outline-none focus:border-primary"
              />

              {/* El estado de las tareas guarda el **nombre** de la columna, así
                  que renombrar las arrastra. Se avisa: quien renombra no tiene
                  por qué saber que el modelo está denormalizado. */}
              {taskCount > 0 && (
                <span className="font-sans text-[11px] text-text-disabled">
                  {taskCount === 1
                    ? 'Su tarea pasará a este estado.'
                    : `Sus ${taskCount} tareas pasarán a este estado.`}
                </span>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  disabled={updating || !name.trim() || name.trim() === columnName}
                  className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: colors.primary }}
                >
                  {updating ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => show('menu')}
                  className="cursor-pointer rounded-lg px-2 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {view === 'delete' && (
            <div className="flex flex-col gap-2 p-1.5">
              <p className="font-sans text-xs text-text-primary">
                ¿Eliminar «{columnName}»?
              </p>
              <p className="font-sans text-[11px]" style={{ color: colors.warning }}>
                {taskCount === 1
                  ? 'Se irá con ella su única tarea.'
                  : `Se irán con ella sus ${taskCount} tareas.`}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  form={`delete-column-${columnId}`}
                  disabled={deleting}
                  className="cursor-pointer rounded-lg px-2.5 py-1.5 font-sans text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: alpha(colors.error, 20), color: colors.error }}
                >
                  {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
                <button
                  type="button"
                  onClick={() => show('menu')}
                  className="cursor-pointer rounded-lg px-2 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  No
                </button>
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="px-1.5 pb-1 font-sans text-[11px]"
              style={{ color: colors.error }}
            >
              {error}
            </p>
          )}
        </div>
      )}

      {/* El formulario de borrado vive fuera del panel: con la columna vacía se
          envía desde el propio ítem del menú, y ese ítem desaparece del árbol al
          cambiar de vista. Dentro, el envío se perdería con él. */}
      <form
        id={`delete-column-${columnId}`}
        ref={deleteFormRef}
        action={deleteAction}
        className="hidden"
      >
        <input type="hidden" name="boardId" value={boardId} />
        <input type="hidden" name="columnId" value={columnId} />
        <input type="hidden" name="projectId" value={projectId} />
      </form>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left font-sans text-xs transition-colors hover:bg-surface"
      style={{ color: tone ?? colors.textPrimary }}
    >
      {children}
    </button>
  );
}

function MenuBack({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start cursor-pointer rounded px-1 font-sans text-[11px] text-text-secondary transition-colors hover:text-text-primary"
    >
      ← Volver
    </button>
  );
}

function PencilIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
