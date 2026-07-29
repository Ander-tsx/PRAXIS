'use client';

import { Badge, Button, type MyInvitation, alpha, colors } from '@praxis/commons';
import { useActionState } from 'react';
import { respondInvitationAction } from '@/app/invitations-actions';
import { INVITATION_RESPONSE_INITIAL_STATE } from '@/lib/action-state';

export interface MyInvitationsProps {
  invitations: MyInvitation[];
}

/**
 * Invitaciones pendientes de quien está viendo el panel.
 *
 * Va **arriba del todo** y con el color de acento: es lo único de esta pantalla
 * que espera una decisión, y es además el único sitio donde se entera de que le
 * han invitado —no hay correo ni notificaciones.
 *
 * Mientras no responda no es miembro: el proyecto no aparece en su lista y no
 * tiene ningún permiso sobre él.
 */
export function MyInvitations({ invitations }: MyInvitationsProps) {
  if (invitations.length === 0) return null;

  return (
    <section
      aria-label="Invitaciones pendientes"
      className="flex flex-col gap-4 rounded-2xl p-5"
      style={{
        background: alpha(colors.accent, 7),
        boxShadow: `inset 3px 0 0 ${colors.accent}`,
      }}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl text-text-primary">
          {invitations.length === 1
            ? 'Tienes una invitación'
            : `Tienes ${invitations.length} invitaciones`}
        </h3>
        <p className="font-sans text-sm text-text-secondary">
          Entrarás al proyecto solo si aceptas.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {invitations.map((invitation) => (
          <InvitationRow key={invitation.id} invitation={invitation} />
        ))}
      </ul>
    </section>
  );
}

function InvitationRow({ invitation }: { invitation: MyInvitation }) {
  const [state, formAction, pending] = useActionState(
    respondInvitationAction,
    INVITATION_RESPONSE_INITIAL_STATE,
  );

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-surface p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-sans text-sm font-semibold text-text-primary">
            {invitation.project.name}
          </span>
          <Badge variant="primary">{invitation.projectRole.name}</Badge>
        </span>

        {invitation.project.description && (
          <span className="line-clamp-1 font-sans text-xs text-text-secondary">
            {invitation.project.description}
          </span>
        )}

        {state.error && (
          <span role="alert" className="font-sans text-xs text-error">
            {state.error}
          </span>
        )}
      </div>

      <form action={formAction} className="flex shrink-0 gap-2">
        <input type="hidden" name="invitationId" value={invitation.id} />

        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="ghost"
          size="sm"
          disabled={pending}
        >
          Rechazar
        </Button>
        <Button type="submit" name="decision" value="accept" size="sm" isLoading={pending}>
          Aceptar
        </Button>
      </form>
    </li>
  );
}
