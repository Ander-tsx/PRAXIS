'use client';

import { useState } from 'react';
import { GlobalRoleBadges } from '@praxis/commons';
import { EditProfileModal } from './EditProfileModal';

export interface AccountIdentityProps {
  nombre: string;
  email: string;
  avatarSrc: string | null;
  coverSrc: string | null;
  biography: string | null;
  location: string | null;
  presencia: string;
  roles: readonly string[];
  estadoDeCuenta: { etiqueta: string; activa: boolean };
  miembroDesde: string;
  actualizado: string;
  initialFirstName: string;
  initialLastName: string;
  children?: React.ReactNode;
}

export function AccountIdentity({
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
  children,
}: AccountIdentityProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const etiqueta = nombre.trim() || email;

  return (
    <>
      <section className="w-full  bg-[#191919] text-white pb-12 min-h-screen">
        {/* Cover Photo */}
        <div className="h-48 sm:h-72 w-full bg-[#161615] relative">
          {coverSrc && <img src={coverSrc} alt="Cover" className="w-full h-full object-cover" />}
        </div>

        <div className="px-6 sm:px-12 max-w-screen-2xl mx-auto">
          <div className="flex justify-between items-start -mt-16 sm:-mt-20 mb-4">
            <span className="rounded-full border-[6px] border-[#080807] relative z-10 bg-[#191919]">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={etiqueta}
                  className="w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover"
                />
              ) : (
                <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-[#161615] flex items-center justify-center text-4xl font-bold">
                  {etiqueta.charAt(0).toUpperCase()}
                </div>
              )}
            </span>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-20 sm:mt-24 px-5 py-1.5 rounded-full border border-white/30 font-bold text-[15px] hover:bg-white/10 transition-colors"
            >
              Editar perfil
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold font-sans tracking-tight">
                  {nombre.trim() || 'Sin nombre'}
                </h2>
                <GlobalRoleBadges roles={roles} />
              </div>
              <p className="text-white text-[15px] font-sans">@{email.split('@')[0]}</p>
            </div>

            {biography && <p className="text-[15px] font-sans whitespace-pre-wrap">{biography}</p>}

            <div className="flex flex-wrap items-center gap-4 text-white text-[15px] font-sans mt-1">
              {location && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>{location}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span>Se unió en {miembroDesde}</span>
              </div>
            </div>
          </div>

          {children}
        </div>
      </section>

      <EditProfileModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialData={{
          firstName: initialFirstName,
          lastName: initialLastName,
          biography: biography || '',
          location: location || '',
          avatarSrc,
          coverSrc,
        }}
      />
    </>
  );
}
