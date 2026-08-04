'use client';

import { Button, type Workspace, alpha, colors,
  projectPath,
} from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { createWorkspaceAction } from '@/app/(private)/[id]/actions';
import { WORKSPACE_INITIAL_STATE } from '@/lib/action-state';
import { WORKSPACE_NAME_MAX, validateWorkspace } from '@/lib/validation';

export interface WorkspacePickerProps {
  projectId: string;
  /**
   * El slug, solo para navegar.
   *
   * Va aparte de `projectId` porque **no son intercambiables**: las acciones de
   * este componente llaman a rutas anidadas, que solo entienden el UUID, y la
   * barra de direcciones quiere el nombre. Navegando con `projectId` se veía
   * una URL bonita convertirse en un UUID al cambiar de espacio.
   */
  projectSlug: string;
  workspaces: Workspace[];
  activeId: string;
  canManage: boolean;
}

/**
 * Selector del espacio sobre el que se trabaja.
 *
 * Es un desplegable y no una fila de tarjetas: los espacios pueden ser muchos y
 * solo se mira uno a la vez, así que ocupar el ancho con todos era ruido.
 *
 * La última opción **es un campo de texto**: escribir un nombre y pulsar Enter
 * crea el espacio y entra en él. Evita el salto a un diálogo modal para algo
 * que es un solo dato, que era lo que chirriaba del botón anterior.
 *
 * El espacio activo vive en la URL (`?ws=`), como la pestaña: se puede enlazar
 * y el botón atrás funciona.
 */
export function WorkspacePicker({
  projectId,
  projectSlug,
  workspaces,
  activeId,
  canManage,
}: WorkspacePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    WORKSPACE_INITIAL_STATE,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const active = workspaces.find((workspace) => workspace.id === activeId);
  const clientError = name.trim() ? validateWorkspace(name) : null;

  /**
   * Al confirmar la creación, cerramos, limpiamos y **entramos en el espacio
   * nuevo**: quien acaba de crearlo quiere trabajar ahí, no seguir donde estaba.
   */
  useEffect(() => {
    if (!state.createdId) return;
    setOpen(false);
    setName('');
    router.replace(projectPath({ slug: projectSlug }, { tab: 'espacios', ws: state.createdId }));
  }, [state.createdId, projectSlug, router]);

  /** Cerrar al pulsar fuera o con Escape, como cualquier desplegable. */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function select(workspaceId: string) {
    setOpen(false);
    router.replace(projectPath({ slug: projectSlug }, { tab: 'espacios', ws: workspaceId }));
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong"
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-sans text-[11px] uppercase tracking-wider text-text-disabled">
            Espacio de trabajo
          </span>
          <span className="truncate font-sans text-base font-semibold text-text-primary">
            {active?.name ?? 'Ninguno todavía'}
          </span>
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-surface"
          style={{ boxShadow: `0 16px 40px ${alpha(colors.overlay, 60)}` }}
        >
          {/* Lista de botones, no un `listbox`: un listbox de verdad exige
              navegación con flechas y foco gestionado, y anunciarlo sin
              implementarlo engaña al lector de pantalla. `aria-current` marca
              el activo, que es lo que hace falta aquí. */}
          {workspaces.length > 0 && (
            <ul className="max-h-64 overflow-y-auto py-1">
              {workspaces.map((workspace) => {
                const isActive = workspace.id === activeId;
                return (
                  <li key={workspace.id}>
                    <button
                      type="button"
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => select(workspace.id)}
                      className={[
                        'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors',
                        isActive ? 'text-text-primary' : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                      ].join(' ')}
                      style={isActive ? { background: alpha(colors.primary, 10) } : undefined}
                    >
                      <span className="truncate font-sans text-sm">{workspace.name}</span>
                      <span className="shrink-0 font-sans text-xs text-text-disabled">
                        {workspace.boards.length}{' '}
                        {workspace.boards.length === 1 ? 'tablero' : 'tableros'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {canManage && (
            <form
              action={formAction}
              noValidate
              onSubmit={(event) => {
                if (clientError || !name.trim()) event.preventDefault();
              }}
              className="flex flex-col gap-2 border-t border-border p-3"
            >
              <input type="hidden" name="projectId" value={projectId} />

              <label
                htmlFor={inputId}
                className="font-sans text-[11px] uppercase tracking-wider text-text-disabled"
              >
                Crear un espacio
              </label>

              <div className="flex gap-2">
                <input
                  id={inputId}
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={WORKSPACE_NAME_MAX}
                  placeholder="Desarrollo, Diseño, QA…"
                  autoComplete="off"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface-elevated px-3 font-sans text-sm text-text-primary outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
                />
                <Button type="submit" size="sm" isLoading={pending} disabled={!name.trim()}>
                  Crear
                </Button>
              </div>

              {(clientError || state.error) && (
                <p role="alert" className="font-sans text-xs text-error">
                  {clientError ?? state.error}
                </p>
              )}
            </form>
          )}

          {workspaces.length === 0 && !canManage && (
            <p className="px-4 py-3 font-sans text-sm text-text-disabled">
              Este proyecto todavía no tiene espacios.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
