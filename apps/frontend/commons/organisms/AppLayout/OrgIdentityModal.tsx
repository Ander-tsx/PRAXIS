import React, { useState } from 'react';
import { Button, FloatingLabelInput, GLYPH_COLOR_DEFAULT, Glyph, GlyphPicker, type GlyphSelection, glyphByKey } from '../../atoms';
import { createApiClient } from '../../api/client';
import { useRouter } from 'next/navigation';
import type { OrgDelSelector } from './AppShell';

export function OrgIdentityModal({
  org,
  zonePath,
  onClose
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
  
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inicial = (name.trim() || org.name?.trim() || 'O').charAt(0).toUpperCase();
  const preview = glyphByKey(seleccion.iconKey) ? (
    <Glyph iconKey={seleccion.iconKey} color={seleccion.color} size="md" shape="square" />
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
      const api = createApiClient({ gatewayPath: zonePath + '/api/gateway' });
      await api.patch(`/organizations/${org.id}`, {
        name: name.trim(),
        iconKey: seleccion.iconKey || null,
        color: seleccion.iconKey ? (seleccion.color || null) : null,
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
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors text-white hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
