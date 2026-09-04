'use client';

import { borrarPapelAction, guardarPapelAction } from '@/app/main/team/actions';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/main/action-state';
import { FloatingLabelInput, useAccion } from '@praxis/commons';
import type {
  OrganizationPermission,
  OrganizationPermissions,
  OrganizationRoleView,
} from '@praxis/commons/billing/planes';
import { TEXTO_DE_PERMISO } from '@praxis/commons/billing/planes';
import { useEffect, useId, useRef, useState } from 'react';

const ORDEN: OrganizationPermission[] = [
  'canManageBilling',
  'canManageMembers',
  'canManageAllProjects',
  'canManageRoleTemplates',
  'canManageOrganization',
  'canInviteMembers',
  'canViewAllProjects',
  'canViewAuditLog',
  'canCreateProject',
];

export function RolesPanel({
  organizationId,
  papeles: roles,
  mios,
  puedeEditar,
}: {
  organizationId: string;
  papeles: OrganizationRoleView[];
  mios: OrganizationPermissions;
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const rolEnEdicion = roles.find((r) => r.id === editando) || null;

  if (editando || creando) {
    return (
      <Formulario
        organizationId={organizationId}
        rol={rolEnEdicion}
        mios={mios}
        onCerrar={() => {
          setEditando(null);
          setCreando(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#191919] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
        <table className="w-full text-left font-sans text-sm text-white">
          <thead className="border-b border-white/10 bg-white/5">
            <tr>
              <th className="px-4 py-4 font-medium text-white/60 min-w-[250px]">Permiso</th>
              {roles.map((rol) => (
                <th
                  key={rol.id}
                  className="px-4 py-4 font-medium text-center min-w-[140px] align-top"
                >
                  <RoleColumnHeader
                    rol={rol}
                    organizationId={organizationId}
                    puedeEditar={puedeEditar}
                    onEditar={() => setEditando(rol.id)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ORDEN.map((clave) => (
              <tr key={clave} className="transition-colors hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-medium text-white/80">{TEXTO_DE_PERMISO[clave]}</td>
                {roles.map((rol) => (
                  <td key={rol.id} className="px-4 py-3 text-center">
                    {rol.permissions[clave] ? (
                      <svg
                        className="mx-auto h-5 w-5 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <span className="text-white/20">-</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {puedeEditar && (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="self-start rounded-lg bg-white text-black px-5 py-2.5 font-sans text-sm font-semibold transition-colors hover:bg-white/90"
        >
          Crear un rol
        </button>
      )}
    </div>
  );
}

function Formulario({
  organizationId,
  rol,
  mios,
  onCerrar,
}: {
  organizationId: string;
  rol: OrganizationRoleView | null;
  mios: OrganizationPermissions;
  onCerrar: () => void;
}) {
  const [state, formAction, pending] = useAccion(guardarPapelAction, ORGANIZACION_INITIAL_STATE);
  const [name, setName] = useState(rol?.name ?? '');
  const [permisos, setPermisos] = useState<Record<string, boolean>>(
    Object.fromEntries(ORDEN.map((clave) => [clave, rol?.permissions[clave] ?? false])),
  );
  const nombreId = useId();

  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  useEffect(() => {
    if (state.done) cerrarRef.current();
  }, [state.done]);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('organizationId', organizationId);
    if (rol) datos.set('roleId', rol.id);
    datos.set('name', name);
    for (const clave of ORDEN) datos.set(`permiso.${clave}`, String(permisos[clave] === true));
    formAction(datos);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#191919] p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-8">
        <button
          type="button"
          onClick={onCerrar}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </button>
        <h3 className="font-sans text-lg font-medium text-white">
          {rol ? 'Editar rol' : 'Crear nuevo rol'}
        </h3>
      </div>

      <form onSubmit={enviar} className="flex flex-col gap-6">
        <div className="max-w-md">
          <FloatingLabelInput
            id={nombreId}
            label="Nombre del rol"
            value={name}
            onChange={(evento) => setName(evento.target.value)}
            maxLength={60}
            placeholder="Ej. Coordinación"
            required
          />
        </div>

        <div className="flex flex-col gap-4">
          <h4 className="font-sans text-sm font-medium text-white border-b border-white/10 pb-2">
            Permisos
          </h4>
          <ul className="flex flex-col divide-y divide-white/5">
            {ORDEN.map((clave) => {
              const puedoDarlo = mios[clave];
              const activado = permisos[clave];

              return (
                <li
                  key={clave}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4"
                >
                  <span className="min-w-0 flex-1 font-sans text-sm text-white/90">
                    {TEXTO_DE_PERMISO[clave]}
                    {!puedoDarlo && (
                      <span className="ml-2 text-xs text-amber-400">
                        — no lo tienes, no puedes darlo
                      </span>
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-1 rounded-lg bg-black/40 p-1">
                    <button
                      type="button"
                      disabled={!puedoDarlo}
                      onClick={() => setPermisos((a) => ({ ...a, [clave]: true }))}
                      className={`rounded-md px-4 py-1.5 font-sans text-xs font-medium transition-all ${
                        activado
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-white/50 hover:text-white hover:bg-white/5 disabled:hover:bg-transparent disabled:opacity-40'
                      }`}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      disabled={!puedoDarlo}
                      onClick={() => setPermisos((a) => ({ ...a, [clave]: false }))}
                      className={`rounded-md px-4 py-1.5 font-sans text-xs font-medium transition-all ${
                        !activado
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-white/50 hover:text-white hover:bg-white/5 disabled:hover:bg-transparent disabled:opacity-40'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {state.error && (
          <p role="alert" className="font-sans text-sm text-red-400">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-4 border-t border-white/10">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-white text-black px-6 py-2.5 font-sans text-sm font-semibold transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? 'Guardando...' : 'Guardar rol'}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg px-6 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function RoleColumnHeader({
  rol,
  organizationId,
  puedeEditar,
  onEditar,
}: {
  rol: OrganizationRoleView;
  organizationId: string;
  puedeEditar: boolean;
  onEditar: () => void;
}) {
  const [state, formAction, pending] = useAccion(borrarPapelAction, ORGANIZACION_INITIAL_STATE);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-white">{rol.name}</span>

      <span className="text-xs text-white/40 font-normal mt-1">
        {rol.miembros === 0
          ? 'Nadie lo lleva'
          : `${rol.miembros} ${rol.miembros === 1 ? 'persona' : 'personas'}`}
      </span>
      {puedeEditar && (
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={onEditar}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Editar
          </button>
          <form action={formAction}>
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="roleId" value={rol.id} />
            <button
              type="submit"
              disabled={pending}
              className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              {pending ? '...' : 'Borrar'}
            </button>
          </form>
        </div>
      )}
      {state.error && <span className="text-[10px] text-red-400 mt-1">{state.error}</span>}
    </div>
  );
}
