'use client';

import {
  cambiarRolAction,
  invitarMiembroAction,
  quitarMiembroAction,
} from '@/app/(private)/organizations/actions';
import { INVITAR_MIEMBRO_INITIAL_STATE, ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
import { Badge, Button, Input, Select, useAccion } from '@praxis/commons';
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
          <Input
            id={correoId}
            name="email"
            type="email"
            label="Invitar por correo"
            placeholder="alguien@ejemplo.com"
            maxLength={160}
            fullWidth
            required
          />
        </div>

        <div className="w-44">
          <Select
            name="role"
            label="Papel"
            value={role}
            onValueChange={setRole}
            options={[
              { value: 'MEMBER', label: 'Miembro' },
              { value: 'ADMIN', label: 'Administra' },
            ]}
            fullWidth
          />
        </div>

        <Button type="submit" isLoading={pending} disabled={sinAsientos}>
          Invitar
        </Button>
      </form>

      {sinAsientos && (
        <p className="font-sans text-xs text-text-secondary">
          No quedan asientos. Amplía el plan o saca a alguien antes de invitar.
        </p>
      )}

      {state.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {state.error}
        </p>
      )}

      {state.enlace && (
        /* Una raya de color a la izquierda en vez de una caja verde entera: es
           un aviso, no un panel. El enlace sí se separa, porque hay que poder
           seleccionarlo entero sin arrastrar media frase con él. */
        <div className="flex flex-col gap-2 border-l-2 border-success py-1 pl-4">
          <p className="font-sans text-sm text-text-primary">
            {state.correoEnviado
              ? `Le hemos mandado un correo a ${state.email}.`
              : `Invitación creada para ${state.email}, pero el correo no salió.`}{' '}
            {/* ⚠️ El enlace se enseña **en los dos casos**: el token en claro
                solo existe aquí —en la base queda su hash— y un correo se pierde
                en no deseados el día que hay que enseñarlo. */}
            Este enlace también sirve, y no se puede volver a ver:
          </p>
          <code className="block break-all font-mono text-xs text-text-secondary">
            {state.enlace}
          </code>
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
    <li className="flex flex-wrap items-center gap-3 border-b border-dotted border-border py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base text-text-primary">
          {miembro.name ?? miembro.email}
        </p>
        {miembro.name && (
          <p className="truncate font-sans text-xs text-text-secondary">{miembro.email}</p>
        )}
      </div>

      <Badge variant={esDueño ? 'primary' : 'default'}>
        {esDueño ? 'Dueño' : (miembro.roleName ?? 'Sin papel')}
      </Badge>
      {miembro.status === 'INVITED' && <Badge variant="warning">Invitación pendiente</Badge>}

      {/* Cambiar de papel es **elegir de una lista**, y por eso este control no
          existía mientras los papeles eran un enum de tres valores: un botón que
          alterna entre dos no sirve cuando puede haber diez.

          ⚠️ Se envía al elegir, sin botón de confirmar: es un campo y no un
          formulario, y pedir dos gestos para un desplegable de dos opciones es
          justo el trámite que sobra. El servidor rechaza un papel con permisos
          que quien lo reparte no tiene, y ese error se enseña abajo. */}
      {seLePuedeTocar && miembro.userId && papeles.length > 0 && (
        <div className="w-44 shrink-0">
          <Select
            value={miembro.roleId ?? ''}
            disabled={cambiando}
            onValueChange={(roleId) => {
              if (!roleId || roleId === miembro.roleId) return;
              const datos = new FormData();
              datos.set('organizationId', organizationId);
              datos.set('userId', miembro.userId as string);
              datos.set('roleId', roleId);
              rolAction(datos);
            }}
            options={papeles.map((papel) => ({ value: papel.id, label: papel.name }))}
            fullWidth
          />
        </div>
      )}

      {seLePuedeTocar && (
        <form action={quitarAction}>
          <input type="hidden" name="organizationId" value={organizationId} />
          {/* El identificador de quien ya entró, o el correo de quien todavía
              no: una invitación sin aceptar no tiene `userId`. */}
          <input type="hidden" name="idOrEmail" value={miembro.userId ?? miembro.email} />
          <Button type="submit" variant="ghost" size="sm" isLoading={quitando}>
            {miembro.status === 'INVITED' ? 'Cancelar' : 'Sacar'}
          </Button>
        </form>
      )}

      {(quitar.error || rol.error) && (
        <p role="alert" className="w-full font-sans text-xs text-error">
          {quitar.error ?? rol.error}
        </p>
      )}
    </li>
  );
}
