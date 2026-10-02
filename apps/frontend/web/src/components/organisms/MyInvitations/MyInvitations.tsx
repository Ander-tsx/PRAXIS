'use client';

import { respondInvitationAction } from '@/app/(privado)/main/invitations-actions';
import { NoticePanel } from '@/components/molecules/NoticePanel';
import { INVITATION_RESPONSE_INITIAL_STATE } from '@/lib/main/action-state';
import { Badge, Button, type MyInvitation, alpha, colors, useAccion } from '@praxis/commons';

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
 *
 * Comparte `NoticePanel` con los avisos de tareas: son la misma clase de cosa
 * —algo que reclama atención al entrar— y antes cada uno tenía su propio
 * rectángulo teñido con una franja de color a la izquierda.
 */
export function MyInvitations({ invitations }: MyInvitationsProps) {
  if (invitations.length === 0) return null;

  return (
    <NoticePanel
      tone={colors.textPrimary}
      icon={<InvitationIcon />}
      count={invitations.length > 1 ? invitations.length : undefined}
      title={invitations.length === 1 ? 'Tienes una invitación' : 'Tienes invitaciones'}
      hint="Entrarás al proyecto solo si aceptas."
    >
      <ul className="flex flex-col gap-2">
        {invitations.map((invitation) => (
          <InvitationRow key={invitation.id} invitation={invitation} />
        ))}
      </ul>
    </NoticePanel>
  );
}

function InvitationRow({ invitation }: { invitation: MyInvitation }) {
  const [state, formAction, pending] = useAccion(
    respondInvitationAction,
    INVITATION_RESPONSE_INITIAL_STATE,
  );

  return (
    <li
      className="flex flex-col gap-3 rounded-sm p-3.5 sm:flex-row sm:items-center"
      style={{ background: alpha(colors.border, 30) }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-sans text-sm font-semibold text-text-primary">
            {invitation.project.name}
          </span>
          <Badge variant="default">{invitation.projectRole.name}</Badge>
        </span>

        {invitation.project.description && (
          <span className="line-clamp-1 font-sans text-xs text-white">
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

/** Sobre: dice de qué va el aviso antes de leer una palabra. */
function InvitationIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.9 5.3a2 2 0 002.2 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}
