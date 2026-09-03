import React, { useEffect, useRef, useState } from 'react';
import { Glyph, glyphByKey } from '../../atoms/GlyphPicker';
import { OrgIdentityModal } from './OrgIdentityModal';
import type { OrgDelSelector } from './AppShell';

/**
 * El `tier` que llega en `OrgDelSelector` es el plan **real** de esa
 * organización —lo escribe el webhook de Stripe en `Organization.tier`, y el
 * selector lo recibe tal cual de `GET /me/organizations`—. Aquí solo se le pone
 * nombre en español; los nombres canónicos y los topes viven en
 * `GET /me/billing/planes`. Un `tier` desconocido cae a «Plan gratuito», que es
 * lo que vale una organización sin suscripción.
 */
const NOMBRE_DE_PLAN: Record<string, string> = {
  FREE: 'Plan gratuito',
  TEAM: 'Plan Equipo',
  BUSINESS: 'Plan Negocio',
  ENTERPRISE: 'Plan Empresa',
};

function etiquetaDePlan(tier?: string | null): string {
  return (tier && NOMBRE_DE_PLAN[tier]) || 'Plan gratuito';
}

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
  const [activeModal, setActiveModal] = useState<
    'invite' | 'newSpace' | 'upgrade' | 'config' | null
  >(null);

  const lista = organizaciones ?? [];
  const activa = lista.find((org) => org.id === activaId) ?? null;
  const primerNombre = name.trim().split(' ')[0];
  const etiqueta = activa?.name ?? `Organización de ${primerNombre || 'Praxis'}`;
  const inicial = (activa?.name ?? primerNombre ?? 'P').charAt(0).toUpperCase();
  const MAX_ORGANIZACIONES_PROPIAS = 3;
  const propias = lista.filter((o) => o.soyDueno).length;
  const caben = propias < MAX_ORGANIZACIONES_PROPIAS;
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    if (abierto) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [abierto]);

  useEffect(() => {
    if (!activaId) return;
    if (document.cookie.includes(`praxis_org=${activaId}`)) return;
    document.cookie = `praxis_org=${activaId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [activaId]);

  function elegir(id: string) {
    document.cookie = `praxis_org=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    if (window.location.pathname.startsWith('/projects/')) {
      window.location.href = '/projects';
    } else {
      window.location.reload();
    }
  }

  /* Con icono elegido, esa es la cara; si no, la inicial sobre el cuadro
     neutro de siempre. La identidad la trae `OrgDelSelector` desde
     `GET /me/organizations`. */
  const cuadro = glyphByKey(activa?.iconKey) ? (
    <Glyph
      iconKey={activa?.iconKey ?? null}
      color={activa?.color ?? null}
      size="sm"
      shape="square"
    />
  ) : (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-sans text-[13px] font-semibold text-white"
      aria-hidden="true"
    >
      {inicial}
    </span>
  );

  if (plegada) {
    return null;
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5"
      >
        {cuadro}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-sans text-[10px] text-white">{etiquetaDePlan(activa?.tier)}</span>
          <span className="truncate font-sans text-[13px] font-semibold text-text-primary">
            {etiqueta}
          </span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-white transition-transform duration-200 ${abierto ? '-rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${abierto ? 'grid-rows-[1fr] opacity-100 mt-1.5' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5 rounded-xl border border-white/10 bg-[#202020] p-1.5 shadow-inner">
            <div className="flex flex-col mb-1 pb-1 border-b border-white/5">
              {/* Contratar y cambiar el plan es **solo del dueño** — el gateway
                  responde 403 a cualquier otro (`checkout` → `organizacionPropia`).
                  A quien no lo es no se le enseña el botón: llevaría a un pago
                  que le van a rechazar. */}
              {activa?.soyDueno && (
                <button
                  onClick={() => setActiveModal('upgrade')}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white/5 text-[13px] text-white hover:text-white transition-colors text-left w-full"
                >
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                  Mejorar plan
                </button>
              )}

              <button
                onClick={() => setActiveModal('invite')}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white/5 text-[13px] text-white hover:text-white transition-colors text-left w-full"
              >
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                Invitar a miembros
              </button>

              {/* Nombre, icono y color de la organización. Ya no abre un modal:
                  navega a su portal (`#configuracion`), donde vive toda la
                  configuración de la organización. `<a>` duro y ruta absoluta
                  con `/dashboard` porque el destino lo sirve otra zona del
                  multi-zone y este selector se monta en las siete. El backend
                  sigue exigiendo `canManageOrganization`; la pantalla enseña la
                  identidad a todo el mundo y el formulario solo a quien puede. */}
              {activaId && (
                <button
                  onClick={() => {
                    setAbierto(false);
                    setActiveModal('config');
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white/5 text-[13px] text-white hover:text-white transition-colors text-left w-full"
                >
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Configuración
                </button>
              )}
            </div>

            <div className="px-3 py-1">
              <span className="text-[10px] font-medium text-white uppercase tracking-wider">
                {name}
              </span>
            </div>

            <div className="flex flex-col max-h-[160px] overflow-y-auto scrollbar-none">
              {lista.map((org) => (
                <OpcionDeOrg
                  key={org.id}
                  activa={org.id === activaId}
                  etiqueta={org.name ?? 'Sin nombre'}
                  detalle={org.kind === 'PERSONAL' ? 'Tu espacio' : 'Equipo'}
                  onClick={() => elegir(org.id)}
                />
              ))}
            </div>

            <div className="mt-1 pt-1 border-t border-white/5 px-2 py-2">
              {caben ? (
                <button
                  onClick={() => setActiveModal('newSpace')}
                  className="flex items-center gap-2.5 px-1 rounded-md hover:bg-white/5 text-[13px] text-white hover:text-white transition-colors text-left w-full"
                >
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Nuevo espacio de trabajo
                </button>
              ) : (
                <p className="font-sans text-[11px] text-white leading-snug px-1">
                  Has creado {propias} de {MAX_ORGANIZACIONES_PROPIAS} espacios, que es el límite
                  por persona.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeModal === 'invite' && activaId && (
        <InviteMemberModal
          organizationId={activaId}
          organizationName={etiqueta}
          onClose={() => setActiveModal(null)}
          zonePath={zonePath}
        />
      )}

      {activeModal === 'config' && activa && (
        <OrgIdentityModal org={activa} zonePath={zonePath} onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'newSpace' && (
        <NewSpaceModal onClose={() => setActiveModal(null)} zonePath={zonePath} />
      )}

      {activeModal === 'upgrade' && activaId && (
        <UpgradeModal onClose={() => setActiveModal(null)} zonePath={zonePath} />
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
      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        activa
          ? 'bg-white/10 text-white font-medium'
          : 'text-white hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className="truncate font-sans text-[13px]">{etiqueta}</span>
      <span className="shrink-0 font-sans text-[10px] text-white">{detalle}</span>
    </button>
  );
}

// ================= MODALS ================= //

function InviteMemberModal({
  organizationId,
  organizationName,
  onClose,
  zonePath,
}: { organizationId: string; organizationName: string; onClose: () => void; zonePath: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`${zonePath}/api/gateway/organizations/${organizationId}/roles`)
      .then((res) => res.json())
      .then((body) => {
        const data = body.data;
        if (Array.isArray(data)) {
          setRoles(data);
          if (data.length > 0) setRole(data[0].id);
        }
      })
      .catch(console.error);
  }, [organizationId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !role) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`${zonePath}/api/gateway/organizations/${organizationId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, roleId: role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || 'Error al invitar');
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
    <ModalWrapper title="Agregar miembros" subtitle={`a ${organizationName}`} onClose={onClose}>
      <form onSubmit={handleInvite} className="p-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white">
            Escribe o pega los correos electrónicos a continuación
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alguien@ejemplo.com"
            className="w-full bg-[#191919] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white">Seleccionar rol</label>
          <div className="flex flex-col gap-2 border border-white/10 rounded-xl overflow-hidden bg-[#191919]">
            {roles.length === 0 ? (
              <div className="px-4 py-4 text-sm text-white text-center">Cargando roles...</div>
            ) : (
              roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={`flex items-start justify-between p-4 text-left transition-colors border-b border-white/5 last:border-b-0 ${role === r.id ? 'bg-white/5' : 'hover:bg-white/[0.02]'}`}
                >
                  <div className="flex flex-col gap-1 pr-6">
                    <span className="text-sm font-medium text-white">{r.name}</span>
                    {r.description && <span className="text-xs text-white">{r.description}</span>}
                  </div>
                  {role === r.id && (
                    <svg
                      className="w-5 h-5 text-white shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
            Invitación enviada con éxito.
          </div>
        )}
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
    </ModalWrapper>
  );
}

function NewSpaceModal({ onClose, zonePath }: { onClose: () => void; zonePath: string }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${zonePath}/api/gateway/me/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message || 'Error al crear');
      }
      if (body?.id) {
        document.cookie = `praxis_org=${body.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <ModalWrapper
      title="Nuevo espacio de trabajo"
      subtitle="Crea un lugar para tu equipo"
      onClose={onClose}
    >
      <form onSubmit={handleCreate} className="p-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white">Nombre del espacio</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Acme Corp"
            className="w-full bg-[#191919] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all"
            required
          />
        </div>
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading || !name}
            className="px-6 py-2.5 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creando...' : 'Crear espacio'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

function UpgradeModal({ onClose, zonePath }: { onClose: () => void; zonePath: string }) {
  return (
    <ModalWrapper
      title="Mejorar plan"
      subtitle="Desbloquea todo el potencial de Praxis"
      onClose={onClose}
    >
      <div className="p-8 flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-bold text-white">Lleva tu equipo al siguiente nivel</h3>
          <p className="text-sm text-white max-w-sm">
            Compara los distintos planes y escoge el que mejor se adapte a tus necesidades y tamaño
            de equipo.
          </p>
        </div>
        <a
          href="/billing"
          className="mt-4 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.3)]"
        >
          Ver planes y precios
        </a>
      </div>
    </ModalWrapper>
  );
}

function ModalWrapper({
  title,
  subtitle,
  onClose,
  children,
}: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-[#191919] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white font-sans">{title}</h2>
            {subtitle && <span className="text-xs text-white">{subtitle}</span>}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white hover:text-white"
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
        {children}
      </div>
    </div>
  );
}
