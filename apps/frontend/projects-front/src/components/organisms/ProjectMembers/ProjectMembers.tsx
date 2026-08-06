import {
  Avatar,
  Badge,
  type ProjectInvitation,
  type ProjectMember,
  type ProjectRole,
  type UserProfile,
  personLabel,
} from '@praxis/commons';
import { InviteMemberDialog } from './InviteMemberDialog';
import { LeaveProjectButton } from './LeaveProjectButton';
import { MemberRoleSelect } from './MemberRoleSelect';
import { PendingInvitations } from './PendingInvitations';
import { RemoveMemberButton } from './RemoveMemberButton';

export interface ProjectMembersProps {
  projectId: string;
  members: ProjectMember[];
  roles: ProjectRole[];
  /** Perfiles indexados por id: los miembros solo traen `userId`. */
  usersById: Map<string, UserProfile>;
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
 * Las invitaciones son de verdad desde `a88e804`: se envían, quedan pendientes
 * y la persona entra al aceptarlas. Lo único que sigue faltando es el aviso —no
 * hay correo ni notificaciones—, así que se entera al abrir su panel.
 */
export function ProjectMembers({
  projectId,
  members,
  roles,
  usersById,
  ownerId,
  canManage,
  invitations,
  projectName,
  currentUserId,
}: ProjectMembersProps) {
  const memberIds = new Set(members.map((member) => member.userId));
  const invitedIds = new Set(invitations.map((invitation) => invitation.userId));

  /**
   * A quién **no** ofrecer al invitar: quienes ya están dentro, quienes tienen
   * una invitación sin responder, y el dueño.
   *
   * Antes se filtraba una lista de candidatos que llegaba desde la página. Ya no
   * llega: buscar en el directorio entero es cosa del diálogo, que lo hace
   * contra el servidor. Aquí solo se dice a quién descartar de esos resultados.
   */
  const excluirIds = [...memberIds, ...invitedIds, ownerId];

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
            <InviteMemberDialog projectId={projectId} roles={roles} excluirIds={excluirIds} />
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
                {/* El mismo círculo que el tablero y la barra lateral: el rojo
                    dice «eres tú» en todo el producto. */}
                <Avatar label={label} mine={member.userId === currentUserId} size="md" />

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

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isOwner && <Badge variant="accent">DUEÑO</Badge>}
                  {/**
                   * Al dueño no se le cambia el rol: tiene bypass en el guard,
                   * así que el desplegable prometería un efecto que no ocurre.
                   *
                   * A ti mismo **sí** puedes cambiártelo, incluso rebajarte.
                   * Impedirlo no protegería de nada —siempre puedes pedírselo a
                   * otro administrador— y esconderlo dejaría la duda de por qué
                   * tu fila se comporta distinto.
                   */}
                  {canManage && !isOwner ? (
                    <MemberRoleSelect
                      projectId={projectId}
                      userId={member.userId}
                      roles={roles}
                      currentRoleId={member.projectRoleId}
                      label={label}
                    />
                  ) : (
                    <Badge variant="primary">{member.projectRole.name}</Badge>
                  )}
                  <span className="hidden font-sans text-xs text-text-disabled sm:inline">
                    desde {dateFormatter.format(new Date(member.joinedAt))}
                  </span>

                  {/**
                   * Al dueño no se le puede quitar: perdería su propio proyecto.
                   * Y **nadie se saca a sí mismo**: al salir pierdes los
                   * permisos, así que tampoco podrías volver a entrar. Para irse
                   * está «Salir del proyecto», que es otra decisión y lo dice.
                   * El backend lo rechaza igualmente con un 400.
                   */}
                  {canManage && !isOwner && member.userId !== currentUserId && (
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
