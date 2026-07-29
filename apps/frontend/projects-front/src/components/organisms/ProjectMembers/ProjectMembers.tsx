import {
  Badge,
  type ProjectInvitation,
  type ProjectMember,
  type ProjectRole,
  type UserProfile,
  alpha,
  colors,
  personLabel,
} from '@praxis/commons';
import { InviteMemberDialog } from './InviteMemberDialog';
import { LeaveProjectButton } from './LeaveProjectButton';
import { PendingInvitations } from './PendingInvitations';
import { RemoveMemberButton } from './RemoveMemberButton';

export interface ProjectMembersProps {
  projectId: string;
  members: ProjectMember[];
  roles: ProjectRole[];
  /** Perfiles indexados por id: los miembros solo traen `userId`. */
  usersById: Map<string, UserProfile>;
  /** Candidatos a añadir. Solo salen quienes ya tienen cuenta. */
  candidates: UserProfile[];
  ownerId: string;
  canManage: boolean;
  /** Enviadas y sin responder: todavía no son miembros. */
  invitations: ProjectInvitation[];
  projectName: string;
  /** Para ofrecer «salir»: solo a quien es miembro y no es el dueño. */
  currentUserId: string;
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Equipo del proyecto.
 *
 * ⚠️ Se llama **"añadir"** y no "invitar" a propósito: el backend no tiene
 * invitaciones. Quien añades entra directamente, sin aceptar nada y sin
 * enterarse hasta que abre el proyecto. Ver PENDIENTES-BACKEND §12.
 */
export function ProjectMembers({
  projectId,
  members,
  roles,
  usersById,
  candidates,
  ownerId,
  canManage,
  invitations,
  projectName,
  currentUserId,
}: ProjectMembersProps) {
  const memberIds = new Set(members.map((member) => member.userId));
  const invitedIds = new Set(invitations.map((invitation) => invitation.userId));

  /** Ni quienes ya están dentro ni quienes tienen una invitación sin responder. */
  const available = candidates.filter(
    (user) => !memberIds.has(user.id) && !invitedIds.has(user.id) && user.id !== ownerId,
  );

  const isMember = memberIds.has(currentUserId);
  const canLeave = isMember && currentUserId !== ownerId;

  return (
    <section className="flex flex-col gap-4" aria-label="Equipo del proyecto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-2xl text-text-primary">Equipo</h3>
          <p className="font-sans text-sm text-text-secondary">
            Quien invites entra al aceptar la invitación, con el rol que le des.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canLeave && <LeaveProjectButton projectId={projectId} projectName={projectName} />}
          {canManage && (
            <InviteMemberDialog projectId={projectId} roles={roles} candidates={available} />
          )}
        </div>
      </div>

      <PendingInvitations
        projectId={projectId}
        invitations={invitations}
        usersById={usersById}
        canManage={canManage}
      />

      {members.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-6 font-sans text-sm text-text-secondary">
          Todavía no hay nadie en este proyecto.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => {
            const user = usersById.get(member.userId);
            const label = user ? personLabel(user) : member.userId;
            const isOwner = member.userId === ownerId;

            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-sans font-bold text-primary"
                  style={{
                    background: alpha(colors.primary, 18),
                    border: `1px solid ${alpha(colors.primary, 45)}`,
                  }}
                >
                  {label[0]?.toUpperCase() ?? '?'}
                </span>

                <div className="flex min-w-0 flex-1 flex-col">
                  {/* Siempre dos líneas, con o sin nombre: si no lo hay,
                      `personLabel` usa la parte local del correo. */}
                  <span className="truncate font-sans text-sm font-semibold text-text-primary">
                    {label}
                  </span>
                  <span className="truncate font-sans text-xs text-text-secondary">
                    {/* Puede faltar si el directorio se cortó por paginación. */}
                    {user?.credential.email ?? 'Correo no disponible'}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isOwner && <Badge variant="accent">DUEÑO</Badge>}
                  <Badge variant="primary">{member.projectRole.name}</Badge>
                  <span className="hidden font-sans text-xs text-text-disabled sm:inline">
                    desde {dateFormatter.format(new Date(member.joinedAt))}
                  </span>

                  {/* Al dueño no se le puede quitar: perdería su propio proyecto. */}
                  {canManage && !isOwner && (
                    <RemoveMemberButton
                      projectId={projectId}
                      userId={member.userId}
                      label={label}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
