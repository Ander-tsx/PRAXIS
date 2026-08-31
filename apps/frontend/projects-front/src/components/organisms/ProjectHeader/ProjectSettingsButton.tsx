'use client';

import { saveProjectSettingsAction } from '@/app/(private)/[id]/actions';
import {
  FloatingLabelInput,
  FloatingLabelTextarea,
  GLYPH_COLOR_DEFAULT,
  Glyph,
  GlyphPicker,
  type GlyphSelection,
  ProjectMonogram,
  glyphByKey,
} from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DeleteProjectButton } from './DeleteProjectButton';

export interface ProjectSettingsButtonProps {
  projectId: string;
  projectName: string;
  projectDescription: string;
  projectIconKey: string | null;
  projectColor: string | null;
  /** `canEditProject`. Sin él no se puede tocar nombre/descripción/identidad. */
  canEdit: boolean;
  /** `canDeleteProject`. Decide si la zona de peligro aparece. */
  canDelete: boolean;
  /** Contadores del inventario, para el diálogo de borrado. */
  workspaceCount: number;
  boardCount: number;
  columnCount: number;
  labelCount: number;
  memberCount: number;
  roleCount: number;
  /** En la pestaña del tablero el alto es escaso: el botón va a icono solo. */
  compacto?: boolean;
}

/**
 * El botón de configuración del proyecto y su modal.
 *
 * ## Por qué un modal y no campos en el sitio
 *
 * El nombre y la descripción se editaban en línea en la cabecera
 * (`EditableProjectFields`). Al sumar icono y color, y con el borrado ya
 * viviendo aquí al lado, tenía más sentido juntarlo todo en un sitio: «la
 * configuración del proyecto» es una cosa, no cuatro sueltas por la cabecera.
 *
 * El guardado es de una vez —botón «Guardar», no autosave— así que la acción
 * **sí revalida** (`saveProjectSettingsAction`). Renombrar regenera el slug; se
 * corrige la URL con `replaceState` para no recargar sobre una dirección que ya
 * no resuelve, igual que hacía el editor en línea.
 */
export function ProjectSettingsButton({
  projectId,
  projectName,
  projectDescription,
  projectIconKey,
  projectColor,
  canEdit,
  canDelete,
  workspaceCount,
  boardCount,
  columnCount,
  labelCount,
  memberCount,
  roleCount,
  compacto = false,
}: ProjectSettingsButtonProps) {
  const [open, setOpen] = useState(false);

  if (!canEdit && !canDelete) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Configuración del proyecto"
        aria-label="Configuración del proyecto"
        className={`flex shrink-0 items-center gap-2 rounded-lg font-sans text-sm text-white transition-colors hover:bg-surface hover:text-white ${
          compacto ? 'h-7 w-7 justify-center' : 'px-3 py-1.5'
        }`}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {!compacto && 'Configuración'}
      </button>

      {open && (
        <ProjectSettingsModal
          projectId={projectId}
          initialName={projectName}
          initialDescription={projectDescription}
          initialIconKey={projectIconKey}
          initialColor={projectColor}
          canEdit={canEdit}
          canDelete={canDelete}
          workspaceCount={workspaceCount}
          boardCount={boardCount}
          columnCount={columnCount}
          labelCount={labelCount}
          memberCount={memberCount}
          roleCount={roleCount}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ProjectSettingsModal({
  projectId,
  initialName,
  initialDescription,
  initialIconKey,
  initialColor,
  canEdit,
  canDelete,
  workspaceCount,
  boardCount,
  columnCount,
  labelCount,
  memberCount,
  roleCount,
  onClose,
}: {
  projectId: string;
  initialName: string;
  initialDescription: string;
  initialIconKey: string | null;
  initialColor: string | null;
  canEdit: boolean;
  canDelete: boolean;
  workspaceCount: number;
  boardCount: number;
  columnCount: number;
  labelCount: number;
  memberCount: number;
  roleCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [seleccion, setSeleccion] = useState<GlyphSelection>({
    iconKey: initialIconKey,
    color: initialColor || GLYPH_COLOR_DEFAULT,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSave() {
    if (!canEdit) return;
    if (name.trim().length < 2) {
      setError('El nombre necesita al menos 2 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);

    const result = await saveProjectSettingsAction({
      projectId,
      name,
      description,
      iconKey: seleccion.iconKey,
      color: seleccion.color,
    });

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    /* Renombrar regenera el slug: la barra de direcciones apunta a uno que ya no
       resuelve y recargar daría 404. Se corrige sin navegar — el contenido ya lo
       actualizó la revalidación de la acción. */
    if (result.savedSlug && !window.location.pathname.endsWith(`/${result.savedSlug}`)) {
      window.history.replaceState(null, '', `/projects/${result.savedSlug}`);
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#191919] shadow-2xl max-h-[90vh]">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#191919]/80 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
              aria-label="Cerrar"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="font-sans text-xl font-bold text-white">Configuración</h2>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || name.trim().length < 2}
              className="rounded-full bg-white px-5 py-1.5 font-bold text-black transition-colors hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto scrollbar-none p-6">
          {canEdit ? (
            <>
              <div className="flex items-center gap-4">
                {glyphByKey(seleccion.iconKey) ? (
                  <Glyph
                    iconKey={seleccion.iconKey}
                    color={seleccion.color}
                    size="md"
                    shape="square"
                  />
                ) : (
                  <ProjectMonogram id={projectId} name={name || initialName} size="md" />
                )}
                <div className="min-w-0 flex-1">
                  <FloatingLabelInput
                    id="project-name"
                    label="Nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>

              <FloatingLabelTextarea
                id="project-description"
                label="Descripción"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />

              <GlyphPicker value={seleccion} onChange={setSeleccion} disabled={saving} />
            </>
          ) : (
            <p className="font-sans text-sm text-white">
              No tienes permiso para cambiar el nombre, la descripción ni la identidad de este
              proyecto.
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {canDelete && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <p className="font-sans text-sm font-semibold text-white">Zona de peligro</p>
              <p className="font-sans text-xs text-white">
                Eliminar el proyecto no se puede deshacer, y se lleva por delante todo lo que hay
                dentro.
              </p>
              <div className="mt-1">
                <DeleteProjectButton
                  projectId={projectId}
                  projectName={initialName}
                  workspaceCount={workspaceCount}
                  boardCount={boardCount}
                  columnCount={columnCount}
                  labelCount={labelCount}
                  memberCount={memberCount}
                  roleCount={roleCount}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
