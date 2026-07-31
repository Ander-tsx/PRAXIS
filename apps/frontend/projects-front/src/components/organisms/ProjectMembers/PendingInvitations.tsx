'use client';

import { Badge, type ProjectInvitation, type UserProfile, alpha, colors, personLabel } from '@praxis/commons';
import { useActionState } from 'react';
import { cancelInvitationAction } from '@/app/(private)/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/action-state';

export interface PendingInvitationsProps {
  projectId: string;
  invitations: ProjectInvitation[];
  usersById: Map<string, UserProfile>;
  canManage: boolean;
}

/**
 * Invitaciones enviadas y todavía sin respuesta.
 *
 * Van aparte del equipo porque **no son miembros**: no tienen permisos ni ven
 * el proyecto. Mezclarlas con la lista real haría creer que ya están dentro.
 */
export function PendingInvitations({
  projectId,
  invitations,
  usersById,
  canManage,
}: PendingInvitationsProps) {
  if (invitations.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-sans text-sm font-medium text-text-secondary">
        Invitaciones pendientes ({invitations.length})
      </h4>

      <ul className="flex flex-col gap-2">
        {invitations.map((invitation) => {
          const user = usersById.get(invitation.userId);
          const label = user ? personLabel(user) : invitation.userId;

          return (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: alpha(colors.warning, 6) }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-sans text-sm font-bold"
                style={{ background: alpha(colors.warning, 15), color: colors.warning }}
              >
                {label[0]?.toUpperCase() ?? '?'}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-sans text-sm text-text-primary">{label}</span>
                <span className="truncate font-sans text-xs text-text-secondary">
                  {user?.credential.email ?? 'Correo no disponible'}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-2">
                <Badge variant="warning">SIN RESPONDER</Badge>
                <Badge variant="primary">{invitation.projectRole.name}</Badge>
                {canManage && <CancelButton projectId={projectId} invitationId={invitation.id} />}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CancelButton({ projectId, invitationId }: { projectId: string; invitationId: string }) {
  const [state, formAction, pending] = useActionState(
    cancelInvitationAction,
    MEMBER_INITIAL_STATE,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <button
        type="submit"
        disabled={pending}
        title={state.error ?? 'Retirar la invitación'}
        className="rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:text-error disabled:opacity-40"
      >
        Retirar
      </button>
    </form>
  );
}
