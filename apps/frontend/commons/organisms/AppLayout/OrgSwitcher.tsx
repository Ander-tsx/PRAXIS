import React, { useEffect, useRef, useState } from 'react';
import type { OrgDelSelector } from './AppShell';

export function OrgSwitcher({
  name,
  plegada,
  organizaciones,
  activaId,
  zonePath,
}: {
  name: string;
  plegada: boolean;
  organizaciones?: OrgDelSelector[];
  activaId: string | null;
  zonePath: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [inviteModalAbierto, setInviteModalAbierto] = useState(false);
  
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const lista = organizaciones ?? [];
  const activa = lista.find((org) => org.id === activaId) ?? null;
  const primerNombre = name.trim().split(' ')[0];
  const etiqueta = activa?.name ?? `Organización de ${primerNombre || 'Praxis'}`;
  const inicial = (activa?.name ?? primerNombre ?? 'P').charAt(0).toUpperCase();
  
  useEffect(() => {
    if (!activaId) return;
    if (document.cookie.includes(`praxis_org=${activaId}`)) return;
    document.cookie = `praxis_org=${activaId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [activaId]);

  function elegir(id: string) {
    document.cookie = `praxis_org=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.href = zonePath;
  }

  const cuadro = (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 font-sans text-[11px] font-bold text-white shadow-sm"
      aria-hidden="true"
    >
      {inicial}
    </span>
  );

  if (plegada) {
    return (
      <div className="flex justify-center" title={etiqueta}>
        {cuadro}
      </div>
    );
  }

  return (
    <div className="relative w-full" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5 disabled:cursor-default group"
      >
        <div className="flex items-center gap-2 min-w-0">
          {cuadro}
          <span className="truncate font-sans text-[13px] font-medium text-white/90 group-hover:text-white transition-colors">
            {etiqueta}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <svg className="h-4 w-4 text-white/40 group-hover:text-white/70 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
        </div>
      </button>

      {abierto && (
        <div className="absolute left-0 top-full mt-1.5 w-[280px] z-[100] rounded-xl border border-white/10 bg-[#161616] shadow-2xl py-2 flex flex-col font-sans">
          
          <div className="px-3 py-2 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-sans text-[18px] font-bold text-white shadow-sm">
              {inicial}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="truncate font-sans text-[13px] font-medium text-white">
                {etiqueta}
              </span>
              <span className="font-sans text-[11px] text-white/50">
                {activa?.tier === 'FREE' || !activa ? 'Plan gratuito' : `Plan ${activa.tier}`}
              </span>
            </div>
          </div>

          <div className="h-px bg-white/5 my-1" />

          <div className="flex flex-col px-1.5">
            <a href="/billing" className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5 text-[13px] text-white/80 hover:text-white transition-colors">
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Mejorar plan
            </a>
            {activaId && (
              <a href={`/organizations/${activaId}`} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5 text-[13px] text-white/80 hover:text-white transition-colors">
                <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Configuración
              </a>
            )}
            <button onClick={() => { setAbierto(false); setInviteModalAbierto(true); }} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5 text-[13px] text-white/80 hover:text-white transition-colors w-full text-left">
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Invitar a miembros
            </button>
            <a href="/organizations/new" className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5 text-[13px] text-white/80 hover:text-white transition-colors">
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Agregar cuenta
            </a>
          </div>

          <div className="h-px bg-white/5 my-1" />

          <div className="px-3 py-1">
            <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
              {name}
            </span>
          </div>
          <div className="flex flex-col px-1.5 max-h-[200px] overflow-y-auto scrollbar-none">
            {lista.map((org) => (
              <OpcionDeOrg
                key={org.id}
                activa={org.id === activaId}
                etiqueta={org.name ?? 'Sin nombre'}
                detalle={org.kind === 'PERSONAL' ? 'Tu espacio' : 'Equipo'}
                onClick={() => elegir(org.id)}
              />
            ))}
            <a href="/organizations/new" className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5 text-[13px] text-white/80 hover:text-white transition-colors mt-1">
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo espacio de trabajo
            </a>
          </div>

          <div className="h-px bg-white/5 my-1" />
          
          <div className="flex flex-col px-1.5">
            <a href="/api/logout" className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5 text-[13px] text-white/80 hover:text-white transition-colors">
              Cerrar sesión
            </a>
          </div>
        </div>
      )}

      {inviteModalAbierto && activaId && (
        <InviteMemberModal 
          organizationId={activaId} 
          organizationName={etiqueta}
          onClose={() => setInviteModalAbierto(false)} 
        />
      )}
    </div>
  );
}

function OpcionDeOrg({
  activa,
  etiqueta,
  detalle,
  onClick,
}: {
  activa: boolean;
  etiqueta: string;
  detalle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-md text-left transition-colors hover:bg-white/5 ${activa ? 'text-white' : 'text-white/70'}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 font-sans text-[9px] font-bold text-white shadow-sm">
          {etiqueta.charAt(0).toUpperCase()}
        </span>
        <span className="truncate font-sans text-[13px] font-medium">{etiqueta}</span>
      </div>
      {activa && (
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

function InviteMemberModal({
  organizationId,
  organizationName,
  onClose
}: {
  organizationId: string;
  organizationName: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/gateway/me/organizations/${organizationId}/roles`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRoles(data);
          if (data.length > 0) {
            setRole(data[0].id);
          }
        }
      })
      .catch(err => console.error(err));
  }, [organizationId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !role) return;
    
    setLoading(true);
    setError(null);
    setSuccess(false);
    
    try {
      const res = await fetch(`/api/gateway/me/organizations/${organizationId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, roleId: role })
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Error al invitar');
      }
      
      setSuccess(true);
      setEmail('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative z-10 w-full max-w-lg bg-[#080807] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Agregar miembros
            </h2>
            <span className="text-xs text-white/50">a {organizationName}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleInvite} className="p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-white/80">
              Escribe o pega los correos electrónicos a continuación
            </label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alguien@ejemplo.com"
              className="w-full bg-[#161616] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-white/80">
              Seleccionar rol
            </label>
            <div className="flex flex-col gap-2 border border-white/10 rounded-xl overflow-hidden bg-[#161616]">
              {roles.length === 0 ? (
                <div className="px-4 py-4 text-sm text-white/50 text-center">Cargando roles...</div>
              ) : (
                roles.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={`flex items-start justify-between p-4 text-left transition-colors border-b border-white/5 last:border-b-0 ${role === r.id ? 'bg-white/5' : 'hover:bg-white/[0.02]'}`}
                  >
                    <div className="flex flex-col gap-1 pr-6">
                      <span className="text-sm font-medium text-white">{r.name}</span>
                      {r.description && <span className="text-xs text-white/50">{r.description}</span>}
                    </div>
                    {role === r.id && (
                      <svg className="w-5 h-5 text-white shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
          
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>}
          {success && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">Invitación enviada con éxito.</div>}

          <div className="mt-2 flex justify-end">
            <button 
              type="submit" 
              disabled={loading || !email || !role}
              className="px-6 py-2.5 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Invitar miembro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
