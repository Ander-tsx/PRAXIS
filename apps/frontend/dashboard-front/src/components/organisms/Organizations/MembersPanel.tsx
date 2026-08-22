'use client';

import {
  cambiarRolAction,
  invitarMiembroAction,
  quitarMiembroAction,
} from '@/app/(private)/organizations/actions';
import { INVITAR_MIEMBRO_INITIAL_STATE, ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
import { Badge, Button, Input, Select, alpha, colors, useAccion } from '@praxis/commons';
import type { OrganizationMemberView, OrganizationRole } from '@praxis/commons/billing/planes';
import { TEXTO_DE_PAPEL } from '@praxis/commons/billing/planes';
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
  miPapel,
  asientos,
}: {
  organizationId: string;
  miembros: OrganizationMemberView[];
  miPapel: OrganizationRole;
  asientos: { contratados: number; ocupados: number };
}) {
  const puedeGestionar = miPapel === 'OWNER' || miPapel === 'ADMIN';
  const quedan = asientos.contratados - asientos.ocupados;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-sans text-lg font-semibold text-text-primary">Miembros</h2>
        {/* ⚠️ Una sola expresión y no dos pegadas: un salto de línea entre
            `{…}` y `{…}` en JSX se convierte en **un espacio**, y salía
            «asientos ocupados , quedan 8». Se ve y no da ningún error. */}
        <p className="font-sans text-sm text-text-secondary">
          {`${asientos.ocupados} de ${asientos.contratados} asientos ocupados` +
            (quedan > 0 ? `, quedan ${quedan} libres.` : ', no queda ninguno libre.')}
        </p>
      </div>

      {puedeGestionar && <Invitar organizationId={organizationId} sinAsientos={quedan <= 0} />}

      <ul className="flex flex-col gap-2">
        {miembros.map((miembro) => (
          <Fila
            key={miembro.userId ?? miembro.email}
            organizationId={organizationId}
            miembro={miembro}
            puedeGestionar={puedeGestionar}
            puedeCambiarPapel={miPapel === 'OWNER'}
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
    <div
      className="flex flex-col gap-3 rounded-2xl border p-4"
      style={{ borderColor: colors.border, background: colors.surfaceElevated }}
    >
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
        <div
          className="flex flex-col gap-2 rounded-xl border px-4 py-3"
          style={{
            borderColor: alpha(colors.success, 35),
            background: alpha(colors.success, 8),
          }}
        >
          <p className="font-sans text-sm text-text-primary">
            Invitación creada para <strong>{state.email}</strong>. Pásale este enlace: es lo único
            que le deja entrar, y no se puede volver a ver.
          </p>
          <code className="block break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs text-text-secondary">
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
  puedeGestionar,
  puedeCambiarPapel,
}: {
  organizationId: string;
  miembro: OrganizationMemberView;
  puedeGestionar: boolean;
  puedeCambiarPapel: boolean;
}) {
  const [quitar, quitarAction, quitando] = useAccion(
    quitarMiembroAction,
    ORGANIZACION_INITIAL_STATE,
  );
  const [rol, rolAction, cambiando] = useAccion(cambiarRolAction, ORGANIZACION_INITIAL_STATE);

  const esDueño = miembro.role === 'OWNER';
  /* Al dueño no se le saca ni se le cambia el papel: hay uno y es quien paga.
     El backend lo rechaza igualmente; aquí es para no ofrecerlo. */
  const seLePuedeTocar = puedeGestionar && !esDueño;

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: colors.border, background: colors.surfaceElevated }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-sm text-text-primary">
          {miembro.name ?? miembro.email}
        </p>
        {miembro.name && (
          <p className="truncate font-sans text-xs text-text-secondary">{miembro.email}</p>
        )}
      </div>

      <Badge variant={esDueño ? 'primary' : 'default'}>{TEXTO_DE_PAPEL[miembro.role]}</Badge>
      {miembro.status === 'INVITED' && <Badge variant="warning">Invitación pendiente</Badge>}

      {seLePuedeTocar && puedeCambiarPapel && miembro.userId && (
        <form action={rolAction} className="flex items-center gap-2">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="userId" value={miembro.userId} />
          <input type="hidden" name="role" value={miembro.role === 'ADMIN' ? 'MEMBER' : 'ADMIN'} />
          <Button type="submit" variant="ghost" size="sm" isLoading={cambiando}>
            {miembro.role === 'ADMIN' ? 'Quitar administración' : 'Hacer que administre'}
          </Button>
        </form>
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
