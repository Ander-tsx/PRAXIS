import { Badge, type ProjectMember, type ProjectRole } from '@praxis/commons';
import { DeleteRoleButton } from './DeleteRoleButton';
import { RoleDialog } from './RoleDialog';
import { PERMISSION_LABELS, impliedFrom, selectedFrom } from './permissions';

export interface ProjectRolesProps {
  projectId: string;
  roles: ProjectRole[];
  members: ProjectMember[];
  /** Sale de `permissions/me`: sin esto no se enseñan las acciones. */
  canManage: boolean;
}

/**
 * Roles del proyecto.
 *
 * Un proyecto nace con un rol "Administrador" y con el dueño dentro, así que
 * esta lista nunca está vacía de verdad. Aun así se contempla, por si alguien
 * borra el último.
 */
export function ProjectRoles({ projectId, roles, members, canManage }: ProjectRolesProps) {
  const usageByRole = new Map<string, number>();
  for (const member of members) {
    usageByRole.set(member.projectRoleId, (usageByRole.get(member.projectRoleId) ?? 0) + 1);
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Roles del proyecto">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h3 className="font-sans font-medium text-text-primary shrink-0">Roles</h3>
          <span className="text-text-disabled font-light shrink-0">/</span>
          <p className="truncate font-sans text-sm text-text-secondary">
            Cada persona entra con un rol, y el rol decide lo que puede hacer.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canManage && <RoleDialog projectId={projectId} triggerLabel="Nuevo rol" />}
        </div>
      </div>

      {roles.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface-elevated px-6 py-8 text-center font-sans text-sm text-text-secondary shadow-sm">
          Este proyecto no tiene roles. Crea uno para poder añadir a alguien.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {roles.map((role) => {
            const selected = selectedFrom(role.permissions);
            const implied = impliedFrom(selected);
            const inUse = usageByRole.get(role.id) ?? 0;

            return (
              <li
                key={role.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1.5">
                    <h4 className="font-sans text-lg font-semibold text-text-primary">
                      {role.name}
                    </h4>
                    <span className="font-sans text-sm font-medium text-text-disabled">
                      {inUse === 0
                        ? 'Sin personas asignadas'
                        : `${inUse} ${inUse === 1 ? 'persona' : 'personas'}`}
                    </span>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <RoleDialog
                        projectId={projectId}
                        role={role}
                        triggerLabel="Editar"
                        triggerVariant="ghost"
                        triggerSize="sm"
                      />
                      <DeleteRoleButton projectId={projectId} role={role} membersUsing={inUse} />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  {[...selected].map((permission) => (
                    <Badge key={permission} variant="primary">
                      {PERMISSION_LABELS[permission]}
                    </Badge>
                  ))}
                  {/* Los implícitos se marcan aparte: se conceden igual, pero
                      no están guardados en el rol. */}
                  {[...implied].map((permission) => (
                    <Badge key={permission} variant="default">
                      {PERMISSION_LABELS[permission]} · incluido
                    </Badge>
                  ))}
                  {selected.size === 0 && (
                     <span className="font-sans text-sm italic text-text-disabled py-1">
                      Sin permisos: quien tenga este rol no podrá hacer nada.
                    </span>
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
