import React, { useState } from 'react';
import {
  Button,
  FloatingLabelInput,
  GLYPH_COLOR_DEFAULT,
  Glyph,
  GlyphPicker,
  type GlyphSelection,
  glyphByKey,
} from '../../atoms';
import { createApiClient } from '../../api/client';
import { ImagePicker } from '../../molecules/ImagePicker';
import { useRouter } from 'next/navigation';
import type { OrgDelSelector } from './AppShell';

export function OrgIdentityModal({
  org,
  zonePath,
  onClose,
}: {
  org: OrgDelSelector;
  zonePath: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(org.name || '');
  const [seleccion, setSeleccion] = useState<GlyphSelection>({
    iconKey: org.iconKey ?? null,
    color: org.color || GLYPH_COLOR_DEFAULT,
  });

  /* La imagen se sube y se quita al momento, sin esperar al «Guardar»: es otro
     endpoint. `imageUrl` lleva la versión que devolvió el servidor. */
  const [imageUrl, setImageUrl] = useState<string | null>(org.imageUrl ?? null);
  const api = createApiClient({ gatewayPath: zonePath + '/api/gateway' });

  async function subirImagen(file: File): Promise<string | null> {
    const datos = new FormData();
    datos.append('file', file);
    try {
      const actualizada = await api.post<{ imageUrl: string | null }>(
        `/organizations/${org.id}/image`,
        undefined,
        { body: datos },
      );
      if (!actualizada?.imageUrl) return 'El servidor no guardó la imagen.';
      setImageUrl(actualizada.imageUrl);
      router.refresh();
      return null;
    } catch (err: any) {
      return err.message || 'No se pudo subir la imagen.';
    }
  }

  async function quitarImagen(): Promise<string | null> {
    try {
      await api.delete(`/organizations/${org.id}/image`);
      setImageUrl(null);
      router.refresh();
      return null;
    } catch (err: any) {
      return err.message || 'No se pudo quitar la imagen.';
    }
  }

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inicial = (name.trim() || org.name?.trim() || 'O').charAt(0).toUpperCase();
  const preview = imageUrl || glyphByKey(seleccion.iconKey) ? (
    <Glyph
      iconKey={seleccion.iconKey}
      imageUrl={imageUrl}
      color={seleccion.color}
      size="md"
      shape="square"
    />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-elevated font-sans text-base font-semibold text-text-primary">
      {inicial}
    </span>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.patch(`/organizations/${org.id}`, {
        name: name.trim(),
        iconKey: seleccion.iconKey || null,
        color: seleccion.iconKey ? seleccion.color || null : null,
      });
      router.refresh();
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar.');
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-[#191919] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white font-sans">Configuración</h2>
            <span className="text-xs text-white">El nombre, icono y color del equipo</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-text-secondary hover:text-white"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <form onSubmit={save} className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              {preview}
              <div className="min-w-0 flex-1">
                <FloatingLabelInput
                  id="org-name"
                  name="name"
                  type="text"
                  label="Nombre"
                  value={name}
                  onChange={(evento: any) => setName(evento.target.value)}
                  maxLength={80}
                />
              </div>
            </div>

            <ImagePicker
              tieneImagen={imageUrl !== null}
              onUpload={subirImagen}
              onRemove={quitarImagen}
              disabled={pending}
            />

            <GlyphPicker value={seleccion} onChange={setSeleccion} disabled={pending} />

            {error && (
              <p role="alert" className="font-sans text-sm text-red-400">
                {error}
              </p>
            )}

            <div>
              <Button type="submit" isLoading={pending} disabled={name.trim().length < 2}>
                Guardar
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
