'use client';

import { useState, useEffect, useRef } from 'react';
import {
  updateProfileAction,
  uploadAvatarAction,
  uploadCoverAction,
} from '@/app/main/profile/actions';
import { Avatar, alpha, colors, FloatingLabelInput, FloatingLabelTextarea } from '@praxis/commons';

export function EditProfileModal({
  isOpen,
  onClose,
  initialData,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialData: {
    firstName: string;
    lastName: string;
    biography: string;
    location: string;
    avatarSrc: string | null;
    coverSrc: string | null;
  };
}) {
  const [formData, setFormData] = useState({
    firstName: initialData.firstName,
    lastName: initialData.lastName,
    biography: initialData.biography,
    location: initialData.location,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialData.avatarSrc);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialData.coverSrc);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        firstName: initialData.firstName,
        lastName: initialData.lastName,
        biography: initialData.biography,
        location: initialData.location,
      });
      setAvatarPreview(initialData.avatarSrc);
      setCoverPreview(initialData.coverSrc);
      setAvatarFile(null);
      setCoverFile(null);
      setError(null);
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (avatarFile) {
        const data = new FormData();
        data.append('file', avatarFile);
        const res = await uploadAvatarAction(data);
        if (res.error) {
          setError(res.error);
          setSaving(false);
          return;
        }
      }
      if (coverFile) {
        const data = new FormData();
        data.append('file', coverFile);
        const res = await uploadCoverAction(data);
        if (res.error) {
          setError(res.error);
          setSaving(false);
          return;
        }
      }

      const res = await updateProfileAction({
        firstName: formData.firstName,
        lastName: formData.lastName,
        biography: formData.biography,
        location: formData.location,
      });

      if (res.error) setError(res.error);
      else onClose();
    } catch {
      setError('Error al guardar el perfil');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl bg-[#191919] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 backdrop-blur-md bg-[#191919]/80 sticky top-0 z-20">
          <div className="flex items-center gap-6">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-white"
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
            <h2 className="text-xl font-bold text-white font-sans">Editar perfil</h2>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-1.5 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-none">
          {/* Cover */}
          <div className="relative h-48 w-full bg-white/5">
            <div className="absolute top-2 right-2 z-10 bg-black/60 px-2 py-1 rounded text-xs text-white">
              Max 5MB
            </div>
            {coverPreview && (
              <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-4">
              <button
                onClick={() => coverInputRef.current?.click()}
                className="p-3 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Avatar */}
          <div className="px-4 relative mb-4">
            <div className="absolute -top-12 sm:-top-14 left-4">
              <div className="relative rounded-full border-4 border-[#080807] overflow-hidden group">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar Preview"
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#161615] flex items-center justify-center text-3xl font-bold text-white">
                    A
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="p-3 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Forms */}
          <div className="px-4 pt-16 pb-8 flex flex-col gap-6">
            {error && (
              <div className="text-red-400 text-sm p-3 bg-red-400/10 rounded-lg">{error}</div>
            )}

            <FloatingLabelInput
              label="Nombre"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />

            <FloatingLabelInput
              label="Apellido"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />

            <FloatingLabelTextarea
              label="Biografía"
              value={formData.biography}
              onChange={(e) => setFormData({ ...formData, biography: e.target.value })}
              rows={3}
            />

            <FloatingLabelInput
              label="Ubicación"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>
        </div>
      </div>

      <input
        type="file"
        className="hidden"
        ref={avatarInputRef}
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
          }
        }}
      />
      <input
        type="file"
        className="hidden"
        ref={coverInputRef}
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setCoverFile(file);
            setCoverPreview(URL.createObjectURL(file));
          }
        }}
      />
    </div>
  );
}
