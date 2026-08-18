'use client';

import {
  createWorkspaceAction,
  deleteWorkspaceAction,
  updateWorkspaceAction,
} from '@/app/(private)/[id]/actions';
import { EntityPanel } from '@/components/molecules/EntityMenu';
import { WORKSPACE_INITIAL_STATE } from '@/lib/action-state';
import { WORKSPACE_NAME_MAX, validateWorkspace } from '@/lib/validation';
import { Button, type Workspace, alpha, colors, projectPath, useAccion } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

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
  /** Renombrar un espacio: `canEditBoard` (sí, el del tablero — ver abajo). */
  canEditBoard: boolean;
  /** Eliminar un espacio: `canDeleteBoard`. */
  canDeleteBoard: boolean;
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
 *
 * **Renombrar y eliminar viven aquí dentro**, en la fila del espacio al que
 * afectan, detrás de tres puntos. Antes eran un botón fijo en la barra de
 * acciones del proyecto que actuaba sobre «el espacio activo» —había que mirar
 * a otra parte de la pantalla para saber cuál era— y que ocupaba sitio
 * permanente para algo que se usa una vez cada muchas semanas.
 *
 * ⚠️ El panel **no** es un popover flotante: la lista es un `overflow-y-auto`
 * dentro de un contenedor `overflow-hidden`, así que un panel absoluto saldría
 * recortado por arriba y por abajo. En vez de eso sustituye al cuerpo del
 * desplegable, que además funciona igual de bien en móvil. La lógica es la
 * misma que la del menú del tablero: las dos montan `EntityPanel`.
 */
export function WorkspacePicker({
  projectId,
  projectSlug,
  workspaces,
  activeId,
  canManage,
  canEditBoard,
  canDeleteBoard,
}: WorkspacePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  /** El espacio cuyo panel de gestión está abierto, si hay alguno. */
  const [gestionando, setGestionando] = useState<Workspace | null>(null);
  const [state, formAction, pending] = useAccion(createWorkspaceAction, WORKSPACE_INITIAL_STATE);
  const [estadoRenombrar, renombrar, renombrando] = useAccion(
    updateWorkspaceAction,
    WORKSPACE_INITIAL_STATE,
  );
  const [estadoEliminar, eliminar, eliminando] = useAccion(
    deleteWorkspaceAction,
    WORKSPACE_INITIAL_STATE,
  );

  const puedeGestionar = canEditBoard || canDeleteBoard;
  /* `useCallback`: el panel lo lleva en las dependencias de un efecto. */
  const cerrarGestion = useCallback(() => setGestionando(null), []);

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
      if (!containerRef.current?.contains(event.target as Node)) cerrar();
    };
    /* Escape sale del panel de gestión primero y del desplegable después: son
       dos capas, y cerrar las dos de golpe obliga a volver a abrir todo para
       corregir una letra. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (gestionando) setGestionando(null);
      else setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, gestionando]);

  function cerrar() {
    setOpen(false);
    setGestionando(null);
  }

  function select(workspaceId: string) {
    cerrar();
    router.replace(projectPath({ slug: projectSlug }, { tab: 'espacios', ws: workspaceId }));
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => (open ? cerrar() : setOpen(true))}
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
          {gestionando ? (
            <div className="flex flex-col gap-1 p-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="truncate font-sans text-sm font-semibold text-text-primary">
                  {gestionando.name}
                </span>
                <button
                  type="button"
                  onClick={cerrarGestion}
                  className="shrink-0 cursor-pointer rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  Volver
                </button>
              </div>

              <EntityPanel
                entidad="espacio"
                nombre={gestionando.name}
                nombreMax={WORKSPACE_NAME_MAX}
                validarNombre={validateWorkspace}
                canEdit={canEditBoard}
                canDelete={canDeleteBoard}
                /* Vacío se borra de un clic; con tableros dentro, hay que
                   escribir el nombre: el borrado cascadea sobre ellos y sobre
                   sus columnas, y el backend responde 200 tan tranquilo. */
                exigeEscribirNombre={gestionando.boards.length > 0}
                avisoDeBorrado={avisoDeBorrado(gestionando)}
                camposOcultos={
                  <>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="workspaceId" value={gestionando.id} />
                  </>
                }
                renombrar={{
                  ejecutar: renombrar,
                  error: estadoRenombrar.error,
                  confirmado: estadoRenombrar.savedName,
                  pendiente: renombrando,
                }}
                eliminar={{
                  ejecutar: eliminar,
                  error: estadoEliminar.error,
                  confirmado: estadoEliminar.savedName,
                  pendiente: eliminando,
                }}
                alCerrar={cerrarGestion}
              />
            </div>
          ) : (
            <>
              {workspaces.length > 0 && (
                <ul className="max-h-64 overflow-y-auto py-1">
                  {workspaces.map((workspace) => {
                    const isActive = workspace.id === activeId;
                    return (
                      /* Fila = elegir + gestionar. Dos botones hermanos y no uno
                     dentro de otro: un `<button>` anidado es HTML inválido y el
                     navegador lo desanida por su cuenta, sacando los tres
                     puntos de la fila. */
                      <li
                        key={workspace.id}
                        className={[
                          'flex items-center transition-colors',
                          isActive ? '' : 'hover:bg-surface-elevated',
                        ].join(' ')}
                        style={isActive ? { background: alpha(colors.primary, 10) } : undefined}
                      >
                        <button
                          type="button"
                          aria-current={isActive ? 'true' : undefined}
                          onClick={() => select(workspace.id)}
                          className={[
                            'flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pl-4 text-left',
                            puedeGestionar ? 'pr-2' : 'pr-4',
                            isActive
                              ? 'text-text-primary'
                              : 'text-text-secondary hover:text-text-primary',
                          ].join(' ')}
                        >
                          <span className="truncate font-sans text-sm">{workspace.name}</span>
                          <span className="shrink-0 font-sans text-xs text-text-disabled">
                            {workspace.boards.length}{' '}
                            {workspace.boards.length === 1 ? 'tablero' : 'tableros'}
                          </span>
                        </button>

                        {puedeGestionar && (
                          <button
                            type="button"
                            onClick={() => setGestionando(workspace)}
                            aria-label={`Opciones del espacio ${workspace.name}`}
                            title="Renombrar o eliminar"
                            className="mr-2 shrink-0 cursor-pointer rounded-lg px-1.5 py-1.5 text-text-disabled transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="5" r="1.7" />
                              <circle cx="12" cy="12" r="1.7" />
                              <circle cx="12" cy="19" r="1.7" />
                            </svg>
                          </button>
                        )}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Qué se lleva por delante borrar un espacio, contado. */
function avisoDeBorrado(workspace: Workspace): string {
  const tableros = workspace.boards.length;
  if (tableros === 0) return 'Está vacío. Aun así, no se puede deshacer.';

  const columnas = workspace.boards.reduce((total, board) => total + board.columns.length, 0);
  const conTableros = `${tableros} ${tableros === 1 ? 'tablero' : 'tableros'}`;
  const conColumnas =
    columnas > 0 ? ` y sus ${columnas} ${columnas === 1 ? 'columna' : 'columnas'}` : '';

  return `Se irán con él ${conTableros}${conColumnas}, con las tareas que haya dentro. No se puede deshacer.`;
}
