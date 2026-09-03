'use client';

import {
  cambiarRolAction,
  invitarMiembroAction,
  quitarMiembroAction,
} from '@/app/(private)/team/actions';
import { INVITAR_MIEMBRO_INITIAL_STATE, ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
import { FloatingLabelInput, useAccion, Avatar } from '@praxis/commons';

import type {
  OrganizationMemberView,
  OrganizationPermissions,
  OrganizationRoleView,
} from '@praxis/commons/billing/planes';
import { useId, useState, useRef, useEffect } from 'react';

export function MembersPanel({
  organizationId,
  miembros,
  permisos,
  roles,
  asientos,
}: {
  organizationId: string;
  miembros: OrganizationMemberView[];
  permisos: OrganizationPermissions;
  roles: OrganizationRoleView[];
  asientos: { contratados: number; ocupados: number };
}) {
  const puedeGestionar = permisos.canManageMembers;
  const quedan = asientos.contratados - asientos.ocupados;

  return (
    <div className="flex flex-col gap-6">
      {puedeGestionar && <Invitar organizationId={organizationId} sinAsientos={quedan <= 0} />}

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#191919]">
        <table className="w-full text-left font-sans text-sm text-white">
          <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-white/60">
            <tr>
              <th className="px-4 py-3 font-medium">Miembro</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {miembros.map((miembro) => (
              <Fila
                key={miembro.userId ?? miembro.email}
                organizationId={organizationId}
                miembro={miembro}
                roles={roles}
                puedeGestionar={puedeGestionar}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Invitar({
  organizationId,
  sinAsientos,
}: {
  organizationId: string;
  sinAsientos: boolean;
}) {
  const [state, formAction, pending] = useAccion(
    invitarMiembroAction,
    INVITAR_MIEMBRO_INITIAL_STATE,
  );
  const [role, setRole] = useState('MEMBER');
  const correoId = useId();

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="organizationId" value={organizationId} />

        <div className="min-w-[16rem] flex-1">
          <FloatingLabelInput
            id={correoId}
            name="email"
            type="email"
            label="Invitar por correo"
            placeholder="alguien@ejemplo.com"
            maxLength={160}
            required
          />
        </div>

        <div className="w-44">
          <input type="hidden" name="role" value={role} />
          <CustomFloatingRoleSelect
            value={role}
            onChange={setRole}
            options={[
              { value: 'MEMBER', label: 'Miembro' },
              { value: 'ADMIN', label: 'Administrador' },
            ]}
          />
        </div>

        <button
          type="submit"
          disabled={pending || sinAsientos}
          className="rounded-md bg-white text-black px-6 h-[58px] font-sans text-sm font-semibold transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Invitando…' : 'Invitar'}
        </button>
      </form>

      {sinAsientos && (
        <p className="font-sans text-xs text-amber-400">
          No quedan asientos disponibles. Amplía el plan antes de invitar.
        </p>
      )}

      {state.error && (
        <p role="alert" className="font-sans text-sm text-red-400">
          {state.error}
        </p>
      )}

      {state.enlace && (
        <div className="flex flex-col gap-2 border-l-2 border-emerald-500/40 py-2 pl-4 bg-emerald-500/5 rounded-r-xl mt-2">
          <p className="font-sans text-sm text-white">
            {state.correoEnviado
              ? `Le hemos mandado un correo a ${state.email}.`
              : `Invitación creada para ${state.email}, pero el correo no salió.`}{' '}
            Este enlace también sirve, y no se puede volver a ver:
          </p>
          <code className="block break-all font-mono text-xs text-emerald-300 bg-black/40 p-2 rounded-lg">
            {state.enlace}
          </code>
        </div>
      )}
    </div>
  );
}

function RoleDropdown({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) || options[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex w-40 items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-left font-sans text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-50"
      >
        <span className="truncate">{selected?.name ?? 'Seleccionar...'}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#202020] shadow-xl">
          <div className="flex max-h-[200px] flex-col overflow-y-auto p-1 scrollbar-none">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={`flex items-center w-full rounded-lg px-3 py-2 text-left font-sans text-sm transition-colors ${
                  value === opt.id ? 'bg-primary/20 text-primary' : 'text-white hover:bg-white/5'
                }`}
              >
                <span className="flex-1 truncate">{opt.name}</span>
                {value === opt.id && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Fila({
  organizationId,
  miembro,
  roles,
  puedeGestionar,
}: {
  organizationId: string;
  miembro: OrganizationMemberView;
  roles: OrganizationRoleView[];
  puedeGestionar: boolean;
}) {
  const [quitar, quitarAction, quitando] = useAccion(
    quitarMiembroAction,
    ORGANIZACION_INITIAL_STATE,
  );
  const [rolState, rolAction, cambiando] = useAccion(cambiarRolAction, ORGANIZACION_INITIAL_STATE);
  const esDueño = miembro.isOwner;
  const seLePuedeTocar = puedeGestionar && !esDueño;

  return (
    <tr className="group transition-colors hover:bg-white/[0.02]">
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-3">
          <Avatar
            label={miembro.name ?? miembro.email}
            src={null} // Si tuvieras avatar URL, iría aquí
            size="sm"
          />
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium text-white">{miembro.name ?? miembro.email}</span>
            {miembro.name && (
              <span className="truncate text-xs text-white/50">{miembro.email}</span>
            )}
            {(quitar.error || rolState.error) && (
              <span className="text-[10px] text-red-400 mt-0.5">
                {quitar.error ?? rolState.error}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        {esDueño ? (
          <span className="inline-flex items-center rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            Dueño
          </span>
        ) : miembro.status === 'INVITED' ? (
          <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
            Invitación pendiente
          </span>
        ) : seLePuedeTocar && miembro.userId && roles.length > 0 ? (
          <RoleDropdown
            value={miembro.roleId ?? ''}
            options={roles}
            disabled={cambiando}
            onChange={(roleId) => {
              if (!roleId || roleId === miembro.roleId) return;
              const datos = new FormData();
              datos.set('organizationId', organizationId);
              datos.set('userId', miembro.userId as string);
              datos.set('roleId', roleId);
              rolAction(datos);
            }}
          />
        ) : (
          <span className="inline-flex items-center rounded-md border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-xs font-medium text-white">
            {miembro.roleName ?? 'Sin rol'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right align-middle">
        {seLePuedeTocar && (
          <form action={quitarAction} className="inline-block">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="idOrEmail" value={miembro.userId ?? miembro.email} />
            <button
              type="submit"
              disabled={quitando}
              className="rounded-md px-3 py-1.5 font-sans text-xs font-medium text-red-400/80 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-40"
            >
              {quitando ? '…' : miembro.status === 'INVITED' ? 'Cancelar' : 'Eliminar'}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}

function CustomFloatingRoleSelect({
  value,
  onChange,
  options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`group relative flex w-full h-[58px] items-center justify-between border ${open ? 'border-primary ring-1 ring-primary' : 'border-white/20'} rounded-md px-3 pt-6 pb-2 transition-all bg-transparent text-white outline-none text-base text-left`}
      >
        <span
          className={`absolute top-2 left-3 text-xs pointer-events-none transition-colors ${open ? 'text-primary' : 'text-white'}`}
        >
          Rol
        </span>
        <span className="truncate">{selected?.label}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180 text-primary' : 'text-white/50'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#202020] shadow-xl">
          <div className="flex flex-col p-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex items-center w-full rounded-lg px-3 py-2.5 text-left font-sans text-sm transition-colors ${
                  value === opt.value ? 'bg-primary/20 text-primary' : 'text-white hover:bg-white/5'
                }`}
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {value === opt.value && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
