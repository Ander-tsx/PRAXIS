'use client';

import { cancelInvitationAction } from '@/app/(private)/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/action-state';
import {
  Badge,
  PERSONA_ELIMINADA,
  type ProjectInvitation,
  type UserProfile,
  personLabel,
  useAccion,
} from '@praxis/commons';

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
      <h4 className="font-sans text-sm font-medium text-white/70">
        Invitaciones pendientes ({invitations.length})
      </h4>

      <ul className="flex flex-col gap-2">
        {invitations.map((invitation) => {
          const user = usersById.get(invitation.userId);
          const label = user ? personLabel(user) : PERSONA_ELIMINADA;

          return (
            /* Se apila en móvil por lo mismo que las filas del equipo: dos
               insignias y un botón no se encogen, y quien cedía el sitio era el
               nombre. Ver la nota de `ProjectMembers`. */
            <li
              key={invitation.id}
              className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-sans text-sm font-bold text-white/70">
                  {label[0]?.toUpperCase() ?? '?'}
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-sans text-sm text-white">{label}</span>
                  <span className="truncate font-sans text-xs text-white/50">
                    {user?.credential.email ?? 'Correo no disponible'}
                  </span>
                </span>
              </span>

              <span className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Badge variant="warning">SIN RESPONDER</Badge>
                <Badge variant="default">{invitation.projectRole.name}</Badge>
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
  const [state, formAction, pending] = useAccion(cancelInvitationAction, MEMBER_INITIAL_STATE);

  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <button
        type="submit"
        disabled={pending}
        title={state.error ?? 'Retirar la invitación'}
        className="rounded-lg px-2 py-1 font-sans text-xs text-white/50 transition-colors hover:text-error disabled:opacity-40"
      >
        Retirar
      </button>
    </form>
  );
}
