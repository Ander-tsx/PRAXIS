'use client';

import { GlobalRoleBadges } from '@praxis/commons';
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

const FILA =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-sans text-[13px] font-medium transition-colors';

/**
 * Tu perfil, **dentro de la barra lateral**.
 *
 * Sustituye a la pantalla `/main/profile`, que se retiró: se abre al pulsar tu
 * nombre y correo en el pie y ocupa el hueco de debajo de las pestañas. Lo monta
 * el `layout.tsx` y llega al armazón como slot (`perfilSlot`): el armazón vive en
 * `commons` y no puede importar nada de `web`.
 *
 * ## Cómo está compuesto, para 320 px
 *
 * Tres bloques, de lo que se mira a lo que casi nunca se toca: **quién eres**
 * (portada baja, foto, nombre, biografía), **tu estado** (plegado: una sola fila
 * hasta que lo pides) y **la cuenta** (filas de menú, la destructiva la última).
 * Sin tarjetas dentro de tarjetas: la única superficie con borde es la cabecera.
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
  const [saliendo, setSaliendo] = useState(false);
  const etiqueta = nombre.trim() || email;

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await fetch('/auth/api/logout', { method: 'POST' });
    } catch {
      /* Aunque falle, se sale igual: las cookies caducan solas. */
    }
    window.location.assign('/');
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* ── Quién eres ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-white/[0.03]">
        <div className="h-16 w-full bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
          {coverSrc && <img src={coverSrc} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-7 flex items-end justify-between gap-2">
            <span className="rounded-full border-[3px] border-[#252525] bg-[#252525]">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={etiqueta}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#161615] text-xl font-bold text-white">
                  {etiqueta.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="mb-1 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-sans text-[12px] font-semibold text-white transition-colors hover:bg-white/15"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.25}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 7.125L16.875 4.5"
                />
              </svg>
              Editar
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-sans text-[15px] font-bold leading-tight text-white">
              {nombre.trim() || 'Sin nombre'}
            </h2>
            <GlobalRoleBadges roles={roles} />
          </div>
          <p className="truncate font-sans text-[12px] text-text-secondary">{email}</p>

          {biography && (
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-white">
              {biography}
            </p>
          )}
          <p className="mt-2 font-sans text-[11px] text-text-secondary">
            {location ? `${location} · ` : ''}Se unió en {miembroDesde}
          </p>
        </div>
      </section>

      {/* ── Tu estado ──────────────────────────────────────────── */}
      <PresencePicker inicial={presencia} />

      {/* ── La cuenta ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => void cerrarSesion()}
          disabled={saliendo}
          className={`${FILA} text-white hover:bg-white/5 disabled:opacity-60`}
        >
          <svg
            className="h-4 w-4 shrink-0 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
            />
          </svg>
          {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
        <DeleteAccount email={email} variante="fila" />
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
