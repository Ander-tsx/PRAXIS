'use client';

import {
  deleteProjectImageAction,
  saveProjectSettingsAction,
  uploadProjectImageAction,
} from '@/app/(privado)/projects/[id]/actions';
import {
  FloatingLabelInput,
  FloatingLabelTextarea,
  GLYPH_COLOR_DEFAULT,
  Glyph,
  GlyphPicker,
  type GlyphSelection,
  ImagePicker,
  ProjectMonogram,
  glyphByKey,
} from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DeleteProjectButton } from './DeleteProjectButton';

export interface ProjectSettingsPanelProps {
  projectId: string;
  initialName: string;
  initialDescription: string;
  initialIconKey: string | null;
  initialColor: string | null;
  initialImageUrl: string | null;
  canEdit: boolean;
  canDelete: boolean;
  workspaceCount: number;
  boardCount: number;
  columnCount: number;
  labelCount: number;
  memberCount: number;
  roleCount: number;
}

/* Una fila por sección: título y explicación a la izquierda, contenido a la
   derecha. En móvil, apilado. */
const SECCION = 'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12';

/**
 * Los ajustes del proyecto, **en la propia página** (`?tab=ajustes`).
 *
 * Eran un modal sobre la pantalla del proyecto. Una pantalla de ajustes con un
 * formulario, imágenes y una zona de peligro necesita espacio y un sitio al que
 * volver con el botón «atrás»: como pestaña tiene URL, se puede enlazar y no
 * tapa lo que se estaba mirando. Filas con una raya fina, no tarjetas.
 */
export function ProjectSettingsPanel({
  projectId,
  initialName,
  initialDescription,
  initialIconKey,
  initialColor,
  initialImageUrl,
  canEdit,
  canDelete,
  workspaceCount,
  boardCount,
  columnCount,
  labelCount,
  memberCount,
  roleCount,
}: ProjectSettingsPanelProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [seleccion, setSeleccion] = useState<GlyphSelection>({
    iconKey: initialIconKey,
    color: initialColor || GLYPH_COLOR_DEFAULT,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [saving, setSaving] = useState(false);

  async function subirImagen(file: File): Promise<string | null> {
    const datos = new FormData();
    datos.set('projectId', projectId);
    datos.set('file', file);
    const resultado = await uploadProjectImageAction(datos);
    if (resultado.error) return resultado.error;
    setImageUrl(resultado.imageUrl);
    router.refresh();
    return null;
  }

  async function quitarImagen(): Promise<string | null> {
    const resultado = await deleteProjectImageAction(projectId);
    if (resultado.error) return resultado.error;
    setImageUrl(null);
    router.refresh();
    return null;
  }
  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!canEdit) return;
    if (name.trim().length < 2) {
      setError('El nombre necesita al menos 2 caracteres.');
      return;
    }
    setSaving(true);
    setSaved(false);
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
    setSaving(false);
    setSaved(true);
  }

  return (
    /* A ancho completo, con el título de cada sección a la izquierda y sus
       campos a la derecha en escritorio. Antes era una columna de `max-w-2xl`
       centrada, y en un monitor grande dos tercios de la pestaña eran vacío. */
    <div className="flex w-full flex-col gap-10 px-1 py-8">
      {canEdit ? (
        <section aria-label="Identidad del proyecto" className={SECCION}>
          <header className="flex flex-col gap-1">
            <h2 className="font-sans text-lg font-semibold text-white">Identidad</h2>
            <p className="font-sans text-sm text-text-secondary">
              El nombre, la descripción y cómo se ve el proyecto en la barra lateral.
            </p>
          </header>

          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex items-center gap-4">
              {imageUrl || glyphByKey(seleccion.iconKey) ? (
                <Glyph
                  iconKey={seleccion.iconKey}
                  imageUrl={imageUrl}
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

            <ImagePicker
              tieneImagen={imageUrl !== null}
              onUpload={subirImagen}
              onRemove={quitarImagen}
              disabled={saving}
            />

            <GlyphPicker value={seleccion} onChange={setSeleccion} disabled={saving} />

            {error && (
              <p role="alert" className="font-sans text-sm text-error">
                {error}
              </p>
            )}

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || name.trim().length < 2}
                className="rounded-lg bg-white px-5 py-2 font-sans text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {saved && (
                <span role="status" className="font-sans text-sm text-success">
                  Guardado.
                </span>
              )}
            </div>
          </div>
        </section>
      ) : (
        <p className="font-sans text-sm text-text-secondary">
          No tienes permiso para cambiar el nombre, la descripción ni la identidad de este proyecto.
        </p>
      )}

      {canDelete && (
        <section aria-label="Zona de peligro" className={`${SECCION} border-t border-border pt-8`}>
          <header className="flex flex-col gap-1">
            <h2 className="font-sans text-lg font-semibold text-white">Zona de peligro</h2>
            <p className="font-sans text-sm text-text-secondary">
              Eliminar el proyecto no se puede deshacer, y se lleva por delante todo lo que hay
              dentro.
            </p>
          </header>
          <div className="flex items-start">
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
        </section>
      )}
    </div>
  );
}
