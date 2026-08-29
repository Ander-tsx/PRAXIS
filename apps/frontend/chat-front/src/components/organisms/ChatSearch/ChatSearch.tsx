'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar, type ChatContact, type Directory, personName, avatarHref, usePresence } from '@praxis/commons';

export function ChatSearch({ contactos, directorio, zonePath }: { contactos: ChatContact[], directorio: Directory, zonePath: string }) {
  const [search, setSearch] = useState('');
  
  const filtered = contactos.filter(c => {
    if (!search.trim()) return true;
    const name = personName(directorio, c.userId).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto h-[60vh] bg-[#080807] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-white/10 bg-[#0d0d0c]">
        <div className="relative">
          <svg className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar contacto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#161616] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all"
            autoFocus
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto scrollbar-none p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/40 gap-2">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-sm">No se encontraron contactos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map(contacto => {
              const profile = directorio.perfiles.get(contacto.userId);
              const name = personName(directorio, contacto.userId);
              return (
                <Link
                  key={contacto.userId}
                  href={`/${contacto.userId}`}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <AvatarRow userId={contacto.userId} profile={profile} zonePath={zonePath} name={name} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-white/90 group-hover:text-white truncate">
                      {name}
                    </span>
                    <span className="text-xs text-white/40 truncate">
                      Comparte {contacto.proyectos.length} {contacto.proyectos.length === 1 ? 'proyecto' : 'proyectos'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AvatarRow({ userId, profile, zonePath, name }: { userId: string, profile: any, zonePath: string, name: string }) {
  const presencia = usePresence(userId, profile?.presence);
  return (
    <Avatar
      src={avatarHref(profile?.avatarUrl, `${zonePath}/api/gateway`)}
      presence={presencia}
      label={name}
    />
  );
}
