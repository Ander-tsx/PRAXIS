import {
  Badge,
  type ProjectMember,
  type ProjectRole,
  type UserProfile,
  alpha,
  colors,
  displayName,
} from '@praxis/commons';
import { AddMemberDialog } from './AddMemberDialog';
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
}: ProjectMembersProps) {
  const memberIds = new Set(members.map((member) => member.userId));
  const available = candidates.filter((user) => !memberIds.has(user.id));

  return (
    <section className="flex flex-col gap-4" aria-label="Equipo del proyecto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-2xl text-text-primary">Equipo</h3>
          <p className="font-sans text-sm text-text-secondary">
            Quien añadas entra al momento: todavía no hay invitaciones que aceptar.
          </p>
        </div>

        {canManage && (
          <AddMemberDialog projectId={projectId} roles={roles} candidates={available} />
        )}
      </div>

      {members.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-6 font-sans text-sm text-text-secondary">
          Todavía no hay nadie en este proyecto.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => {
            const user = usersById.get(member.userId);
            const name = user ? displayName(user) : '';
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
                  {(name || user?.credential.email || '?')[0]?.toUpperCase()}
                </span>

                <div className="flex min-w-0 flex-1 flex-col">
                  {name && (
                    <span className="truncate font-sans text-sm font-semibold text-text-primary">
                      {name}
                    </span>
                  )}
                  <span className="truncate font-sans text-xs text-text-secondary">
                    {/* Puede faltar si el directorio se cortó por paginación. */}
                    {user?.credential.email ?? member.userId}
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
                      label={name || user?.credential.email || 'esta persona'}
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
