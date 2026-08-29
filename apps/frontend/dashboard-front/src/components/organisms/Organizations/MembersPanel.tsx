'use client';

import {
  cambiarRolAction,
  invitarMiembroAction,
  quitarMiembroAction,
} from '@/app/(private)/team/actions';
import { INVITAR_MIEMBRO_INITIAL_STATE, ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
import { FloatingLabelInput, useAccion } from '@praxis/commons';
import { FloatingLabelSelect } from '@praxis/commons/atoms/FloatingLabelSelect';
import type {
  OrganizationMemberView,
  OrganizationPermissions,
  OrganizationRoleView,
} from '@praxis/commons/billing/planes';
import { useId, useState } from 'react';

/**
 * Quién está dentro de la organización, y las tres cosas que se hacen con ello.
 *
 * ⚠️ **Los botones se apagan por el papel de quien mira, y eso no protege
 * nada.** Quien decide es billing-service: un `MEMBER` que llame a mano recibe
 * un 403 con `SIN_PERMISO`. Apagarlos aquí es para no ofrecer lo que se va a
 * negar, que es distinto de impedirlo.
 */
export function MembersPanel({
  organizationId,
  miembros,
  permisos,
  papeles,
  asientos,
}: {
  organizationId: string;
  miembros: OrganizationMemberView[];
  /** Lo que puede hacer quien mira, ya resuelto por el servidor. */
  permisos: OrganizationPermissions;
  /**
   * Los papeles de la organización, para poder cambiar el de alguien.
   *
   * ⚠️ **Vacío si quien mira no puede verlos**, y entonces no se ofrece cambiar
   * — que es lo correcto: la lista de papeles es un mapa del poder interno y no
   * la lee cualquiera con asiento. El servidor lo comprueba igual.
   */
  papeles: OrganizationRoleView[];
  asientos: { contratados: number; ocupados: number };
}) {
  const puedeGestionar = permisos.canManageMembers;
  const quedan = asientos.contratados - asientos.ocupados;

  return (
    /* Sin título propio: lo pone el bloque que la envuelve en el portal. Antes
       lo repetía aquí dentro y salían dos «Miembros» seguidos. */
    <section className="flex flex-col gap-6">
      {puedeGestionar && <Invitar organizationId={organizationId} sinAsientos={quedan <= 0} />}

      <ul className="flex flex-col">
        {miembros.map((miembro) => (
          <Fila
            key={miembro.userId ?? miembro.email}
            organizationId={organizationId}
            miembro={miembro}
            papeles={papeles}
            puedeGestionar={puedeGestionar}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * El formulario de invitar, con el enlace a la vista al terminar.
 *
 * ⚠️ **El enlace solo llega una vez.** En la base queda su hash, así que si se
 * pierde hay que cancelar la invitación y volver a invitar: por eso se queda en
 * pantalla y copiable en vez de desaparecer tras un «hecho».
 */
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
      {/* `action={…}` y no `onSubmit`: este formulario **da de alta**, así que
          el reseteo automático de React 19 es justo lo que se quiere — la caja
          se vacía sola para la siguiente invitación. */}
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
          <FloatingLabelSelect
            id={correoId + '-role'}
            name="role"
            label="Rol"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: 'MEMBER', label: 'Miembro' },
              { value: 'ADMIN', label: 'Administra' },
            ]}
          />
        </div>

        <button
          type="submit"
          disabled={pending || sinAsientos}
          className="rounded-full border border-white/[0.14] bg-white/[0.04] px-4 py-2 font-sans text-xs font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Invitando…' : 'Invitar'}
        </button>
      </form>

      {sinAsientos && (
        <p className="font-sans text-xs text-white/45">
          No quedan asientos. Amplía el plan o saca a alguien antes de invitar.
        </p>
      )}

      {state.error && (
        <p role="alert" className="font-sans text-sm text-red-400">
          {state.error}
        </p>
      )}

      {state.enlace && (
        /* Una raya de color a la izquierda en vez de una caja verde entera: es
           un aviso, no un panel. El enlace sí se separa, porque hay que poder
           seleccionarlo entero sin arrastrar media frase con él. */
        <div className="flex flex-col gap-2 border-l-2 border-emerald-500/40 py-1 pl-4">
          <p className="font-sans text-sm text-white/80">
            {state.correoEnviado
              ? `Le hemos mandado un correo a ${state.email}.`
              : `Invitación creada para ${state.email}, pero el correo no salió.`}{' '}
            {/* ⚠️ El enlace se enseña **en los dos casos**: el token en claro
                solo existe aquí —en la base queda su hash— y un correo se pierde
                en no deseados el día que hay que enseñarlo. */}
            Este enlace también sirve, y no se puede volver a ver:
          </p>
          <code className="block break-all font-mono text-xs text-white/45">{state.enlace}</code>
        </div>
      )}
    </div>
  );
}

function Fila({
  organizationId,
  miembro,
  papeles,
  puedeGestionar,
}: {
  organizationId: string;
  miembro: OrganizationMemberView;
  papeles: OrganizationRoleView[];
  puedeGestionar: boolean;
}) {
  const [quitar, quitarAction, quitando] = useAccion(
    quitarMiembroAction,
    ORGANIZACION_INITIAL_STATE,
  );
  const [rol, rolAction, cambiando] = useAccion(cambiarRolAction, ORGANIZACION_INITIAL_STATE);
  const esDueño = miembro.isOwner;
  /* Al dueño no se le saca ni se le cambia el papel: hay uno y es quien paga.
     El backend lo rechaza igualmente; aquí es para no ofrecerlo. */
  const seLePuedeTocar = puedeGestionar && !esDueño;

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-[15px] font-medium text-white/90">
          {miembro.name ?? miembro.email}
        </p>
        {miembro.name && (
          <p className="truncate font-sans text-xs text-white/45">{miembro.email}</p>
        )}
      </div>

      <span
        className={`shrink-0 rounded-md border px-2 py-0.5 font-sans text-xs font-medium ${
          esDueño
            ? 'border-primary/40 bg-primary/15 text-primary'
            : 'border-white/[0.12] bg-white/[0.04] text-white/70'
        }`}
      >
        {esDueño ? 'Dueño' : (miembro.roleName ?? 'Sin rol')}
      </span>
      {miembro.status === 'INVITED' && (
        <span className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-sans text-xs font-medium text-amber-400">
          Invitación pendiente
        </span>
      )}

      {/* Cambiar de rol es **elegir de una lista**, y por eso este control no
          existía mientras los papeles eran un enum de tres valores: un botón que
          alterna entre dos no sirve cuando puede haber diez.

          ⚠️ Se envía al elegir, sin botón de confirmar: es un campo y no un
          formulario, y pedir dos gestos para un desplegable de dos opciones es
          justo el trámite que sobra. El servidor rechaza un rol con permisos
          que quien lo reparte no tiene, y ese error se enseña abajo. */}
      {seLePuedeTocar && miembro.userId && papeles.length > 0 && (
        <div className="w-44 shrink-0 relative">
          <select
            value={miembro.roleId ?? ''}
            disabled={cambiando}
            onChange={(e) => {
              const roleId = e.target.value;
              if (!roleId || roleId === miembro.roleId) return;
              const datos = new FormData();
              datos.set('organizationId', organizationId);
              datos.set('userId', miembro.userId as string);
              datos.set('roleId', roleId);
              rolAction(datos);
            }}
            className="w-full rounded-md border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-sm text-white/90 outline-none transition-colors hover:border-white/25 focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 appearance-none"
          >
            {papeles.map((papel) => (
              <option key={papel.id} value={papel.id} className="bg-[#1a1a1a] text-white">
                {papel.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/50">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      )}

      {seLePuedeTocar && (
        <form action={quitarAction}>
          <input type="hidden" name="organizationId" value={organizationId} />
          {/* El identificador de quien ya entró, o el correo de quien todavía
              no: una invitación sin aceptar no tiene `userId`. */}
          <input type="hidden" name="idOrEmail" value={miembro.userId ?? miembro.email} />
          <button
            type="submit"
            disabled={quitando}
            className="rounded-md px-2.5 py-1.5 font-sans text-xs font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            {quitando ? '…' : miembro.status === 'INVITED' ? 'Cancelar' : 'Sacar'}
          </button>
        </form>
      )}

      {(quitar.error || rol.error) && (
        <p role="alert" className="w-full font-sans text-xs text-red-400">
          {quitar.error ?? rol.error}
        </p>
      )}
    </li>
  );
}
