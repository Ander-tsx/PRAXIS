'use client';

import { GlobalRoleBadges, LogoutButton } from '@praxis/commons';
import { useState } from 'react';
import { EditProfileModal } from '../AccountIdentity/EditProfileModal';
import { DeleteAccount } from '../DeleteAccount';
import { PresencePicker } from '../PresencePicker';

export interface PerfilEnBarraProps {
  nombre: string;
  email: string;
  avatarSrc: string | null;
  coverSrc: string | null;
  biography: string | null;
  location: string | null;
  presencia: string;
  roles: readonly string[];
  miembroDesde: string;
  initialFirstName: string;
  initialLastName: string;
}

/**
 * Tu perfil, **dentro de la barra lateral**.
 *
 * Sustituye a la pantalla `/main/profile`, que se retiró: se abre al pulsar tu
 * nombre y correo en el pie de la barra y ocupa el hueco de debajo de las
 * pestañas. Es la misma información —portada, foto, nombre, biografía, estado,
 * cerrar sesión y eliminar la cuenta— compuesta para 320 px.
 *
 * Lo monta el `layout.tsx` y llega al armazón como slot (`perfilSlot`): el
 * armazón vive en `commons` y no puede importar nada de `web`.
 */
export function PerfilEnBarra({
  nombre,
  email,
  avatarSrc,
  coverSrc,
  biography,
  location,
  presencia,
  roles,
  miembroDesde,
  initialFirstName,
  initialLastName,
}: PerfilEnBarraProps) {
  const [editando, setEditando] = useState(false);
  const etiqueta = nombre.trim() || email;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="overflow-hidden rounded-xl border border-border bg-white/[0.03]">
        <div className="h-20 w-full bg-[#161615]">
          {coverSrc && <img src={coverSrc} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-8 flex items-end justify-between">
            <span className="rounded-full border-4 border-[#202020] bg-[#202020]">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={etiqueta}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#161615] text-2xl font-bold text-white">
                  {etiqueta.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-full border border-white/30 px-3.5 py-1 font-sans text-[12px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              Editar perfil
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="font-sans text-base font-bold text-white">
              {nombre.trim() || 'Sin nombre'}
            </h2>
            <GlobalRoleBadges roles={roles} />
          </div>
          <p className="truncate font-sans text-[12px] text-text-secondary">{email}</p>

          {biography && (
            <p className="mt-2 whitespace-pre-wrap font-sans text-[13px] text-white">
              {biography}
            </p>
          )}
          <p className="mt-2 font-sans text-[11px] text-text-secondary">
            {location ? `${location} · ` : ''}Se unió en {miembroDesde}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="px-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-white">
          Tu estado
        </h3>
        <PresencePicker inicial={presencia} />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="px-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-white">
          Sesión y cuenta
        </h3>
        <div className="w-fit">
          <LogoutButton compacto={false} />
        </div>
        <div className="w-fit">
          <DeleteAccount email={email} />
        </div>
      </div>

      <EditProfileModal
        isOpen={editando}
        onClose={() => setEditando(false)}
        initialData={{
          firstName: initialFirstName,
          lastName: initialLastName,
          biography: biography || '',
          location: location || '',
          avatarSrc,
          coverSrc,
        }}
      />
    </div>
  );
}
