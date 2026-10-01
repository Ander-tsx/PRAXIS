'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { Glyph, glyphByKey } from '../../atoms/GlyphPicker';
import { createApiClient } from '../../api/client';
import { ImagePicker } from '../../molecules/ImagePicker';
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

/**
 * Rutas que enseñan **un recurso concreto** de la organización activa.
 *
 * ⚠️ Al cambiar de organización hay que salir de ellas, no recargarlas: el
 * proyecto, el informe o el chat que hay debajo pertenecen a la que se acaba de
 * dejar. Recargando, la barra lateral cambia entera y el contenido central se
 * queda enseñando algo de otro sitio — o da un 403 sin explicar por qué.
 *
 * Estaba escrito como una sola comparación contra `/projects/`, así que
 * `/chat/proyecto/:id` se quedaba abierto. Es una lista porque va a crecer con
 * cada pantalla que enseñe un recurso de la organización.
 *
 * ⚠️ `/reports/:id` salió de aquí al archivarse la zona de Análisis (F1 de
 * PLAN-FUSION-ZONAS). Si el informe vuelve a tener pantalla propia, vuelve
 * también esta línea: es de las que no fallan, solo dejan ver datos de la
 * organización que se acaba de dejar.
 *
 * El valor es a dónde se sale: la raíz de esa misma zona, que sí se recalcula
 * con la organización nueva.
 */
const RUTAS_DE_UN_RECURSO: ReadonlyArray<readonly [prefijo: string, salida: string]> = [
  ['/projects/', '/projects'],
  ['/chat/proyecto/', '/chat'],
];

export function OrgSwitcherSalida(pathname: string): string | null {
  for (const [prefijo, salida] of RUTAS_DE_UN_RECURSO) {
    if (pathname.startsWith(prefijo)) return salida;
  }
  return null;
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
    /* Navegación dura y no `router.push`: la cookie la lee el **servidor** al
       pintar, así que hace falta una petición nueva. Y si lo que hay debajo es
       un recurso de la organización que se acaba de dejar, se sale de él en vez
       de recargarlo. Ver `RUTAS_DE_UN_RECURSO`. */
    const salida = OrgSwitcherSalida(window.location.pathname);
    if (salida) {
      window.location.href = salida;
    } else {
      window.location.reload();
    }
  }

  const cuadro = <CaraDeOrg org={activa} inicial={inicial} />;

  if (plegada) {
    return null;
  }

  return (
    /* `shrink-0` por lo mismo que las pestañas: es un hijo de un `flex flex-col`
       con scroll, y sin esto el navegador lo comprime cuando el contenido de
       debajo crece. Ver el aviso de `SidebarTabs`. */
    <div className="relative shrink-0" ref={popoverRef}>
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
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white/5 text-[13px] text-text-secondary hover:text-white transition-colors text-left w-full"
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
                className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white/5 text-[13px] text-text-secondary hover:text-white transition-colors text-left w-full"
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
                  configuración de la organización. Ruta absoluta
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
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white/5 text-[13px] text-text-secondary hover:text-white transition-colors text-left w-full"
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

            <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-none">
              {lista.map((org) => (
                <OpcionDeOrg
                  key={org.id}
                  activa={org.id === activaId}
                  cara={<CaraDeOrg org={org} inicial={(org.name ?? primerNombre ?? 'P').charAt(0).toUpperCase()} />}
                  etiqueta={org.name ?? `Organización de ${primerNombre || 'Praxis'}`}
                  detalle={org.kind === 'PERSONAL' ? 'Tu espacio' : 'Equipo'}
                  onClick={() => elegir(org.id)}
                />
              ))}
            </div>

            <div className="mt-1 pt-1 border-t border-white/5 px-2 py-2">
              {caben ? (
                <button
                  onClick={() => setActiveModal('newSpace')}
                  className="flex items-center gap-2.5 px-1 rounded-md hover:bg-white/5 text-[13px] text-text-secondary hover:text-white transition-colors text-left w-full"
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

/**
 * La cara de una organización: su imagen o icono elegidos, o la inicial sobre el
 * cuadro neutro de siempre. La identidad la trae `OrgDelSelector`. La usan el
 * botón del selector **y cada fila de la lista**: antes la lista solo tenía el
 * nombre, y no se veía de quién era cada espacio.
 */
function CaraDeOrg({ org, inicial }: { org: OrgDelSelector | null; inicial: string }) {
  return org?.imageUrl || glyphByKey(org?.iconKey) ? (
    <Glyph
      iconKey={org?.iconKey ?? null}
      imageUrl={org?.imageUrl ?? null}
      color={org?.color ?? null}
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
}

function OpcionDeOrg({
  activa,
  cara,
  etiqueta,
  detalle,
  onClick,
}: {
  activa: boolean;
  cara: React.ReactNode;
  etiqueta: string;
  detalle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
        activa
          ? 'bg-white/10 text-white font-medium'
          : 'text-white hover:bg-white/5 hover:text-white'
      }`}
    >
      {cara}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-sans text-[13px]">{etiqueta}</span>
        <span className="font-sans text-[10px] text-text-secondary">{detalle}</span>
      </span>
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
  /* La imagen se **guarda** al elegirla y se sube justo después de crear el
     espacio: hasta entonces la organización no existe y no hay endpoint al que
     mandarla. */
  const [imagen, setImagen] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  /* Si el espacio se creó pero la imagen no subió, no se crea otro: se entra. */
  const [creadaId, setCreadaId] = useState<string | null>(null);

  useEffect(() => {
    if (!imagen) return setVista(null);
    const url = URL.createObjectURL(imagen);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [imagen]);

  function entrar(id: string) {
    document.cookie = `praxis_org=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creadaId) return entrar(creadaId);
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const api = createApiClient({ gatewayPath: `${zonePath}/api/gateway` });
      /* `createApiClient` desenvuelve el `{ success, data }`: con `fetch` a pelo,
         `body.id` era `undefined` y la cookie de la organización nueva nunca se
         escribía. */
      const creada = await api.post<{ id: string }>('/me/organizations', { name });
      if (!creada?.id) throw new Error('El servidor no creó el espacio.');

      if (imagen) {
        const datos = new FormData();
        datos.append('file', imagen);
        try {
          await api.post(`/organizations/${creada.id}/image`, undefined, { body: datos });
        } catch {
          setCreadaId(creada.id);
          setError(
            'El espacio se creó, pero no se pudo subir la imagen. Puedes ponerla después en Configuración.',
          );
          setLoading(false);
          return;
        }
      }
      entrar(creada.id);
    } catch (err: any) {
      setError(err.message || 'Error al crear');
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
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-white">Imagen (opcional)</span>
          <div className="flex items-center gap-4">
            {vista ? (
              <span
                role="img"
                aria-label="Vista previa"
                className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-cover bg-center"
                style={{ backgroundImage: `url(${vista})` }}
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base font-semibold text-white"
              >
                {(name.trim() || 'E').charAt(0).toUpperCase()}
              </span>
            )}
            <ImagePicker
              tieneImagen={imagen !== null}
              onUpload={async (file) => {
                setImagen(file);
                return null;
              }}
              onRemove={async () => {
                setImagen(null);
                return null;
              }}
              disabled={loading || creadaId !== null}
            />
          </div>
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
            {loading ? 'Creando...' : creadaId ? 'Entrar al espacio' : 'Crear espacio'}
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
        <Link
          /* ⚠️ `/main/billing`. Era `/billing`, y esa ruta no existe en ninguna
             parte desde que «Suscripción» salió de la barra lateral: el botón
             llevaba a un 404. */
          href="/main/billing"
          className="mt-4 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.3)]"
        >
          Ver planes y precios
        </Link>
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
        {children}
      </div>
    </div>
  );
}
