'use client';
import { Button } from '@praxis/commons';
import { Badge, type ProjectMember, type ProjectRole } from '@praxis/commons';
import { useState } from 'react';
import { DeleteRoleForm } from './DeleteRoleForm';
import { RoleForm } from './RoleForm';
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
  const [isCreating, setIsCreating] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);

  const usageByRole = new Map<string, number>();
  for (const member of members) {
    usageByRole.set(member.projectRoleId, (usageByRole.get(member.projectRoleId) ?? 0) + 1);
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Roles del proyecto">
      {/* Encabezado de sección: misma barra que Equipo y Automatización —nombre,
          separador, una frase, y la acción a la derecha—. Los tres usan los
          mismos tokens; ver el comentario gemelo en `ProjectRules`. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h3 className="shrink-0 font-sans text-sm font-semibold text-text-primary">Roles</h3>
          <span className="shrink-0 font-light text-text-disabled">/</span>
          <p className="truncate font-sans text-sm text-text-secondary">
            Cada persona entra con un rol, y el rol decide lo que puede hacer.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canManage && (
            <Button
              variant={isCreating ? 'secondary' : 'primary'}
              onClick={() => setIsCreating(!isCreating)}
            >
              {isCreating ? 'Cancelar' : 'Nuevo rol'}
            </Button>
          )}
        </div>
      </div>

      {/* ⚠️ Aquí ponía `animate-in slide-in-from-top-4 fade-in duration-300`, del
          plugin `tailwindcss-animate`, **que no está instalado**: Tailwind no
          genera nada para una utilidad que no conoce y no avisa. */}
      {isCreating && canManage && (
        <div className="animate-desplegar-panel">
          <RoleForm
            projectId={projectId}
            onCancel={() => setIsCreating(false)}
            onSuccess={() => setIsCreating(false)}
          />
        </div>
      )}

      {roles.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-6 py-8 text-center font-sans text-sm text-text-secondary">
          Este proyecto no tiene roles. Crea uno para poder añadir a alguien.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {roles.map((role) => {
            const selected = selectedFrom(role.permissions);
            const implied = impliedFrom(selected);
            const inUse = usageByRole.get(role.id) ?? 0;

            if (editingRoleId === role.id) {
              return (
                <li key={role.id} className="animate-desplegar-panel lg:col-span-2">
                  <RoleForm
                    projectId={projectId}
                    role={role}
                    onCancel={() => setEditingRoleId(null)}
                    onSuccess={() => setEditingRoleId(null)}
                  />
                </li>
              );
            }

            if (deletingRoleId === role.id) {
              const inUse = usageByRole.get(role.id) ?? 0;
              return (
                <li key={role.id} className="animate-desplegar-panel lg:col-span-2">
                  <DeleteRoleForm
                    projectId={projectId}
                    role={role}
                    membersUsing={inUse}
                    onCancel={() => setDeletingRoleId(null)}
                  />
                </li>
              );
            }

            return (
              <li
                key={role.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1.5">
                    <h4 className="font-sans text-base font-semibold text-white">{role.name}</h4>
                    <span className="font-sans text-sm font-medium text-text-secondary">
                      {inUse === 0
                        ? 'Sin personas asignadas'
                        : `${inUse} ${inUse === 1 ? 'persona' : 'personas'}`}
                    </span>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingRoleId(role.id)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingRoleId(role.id)}>
                        Eliminar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  {[...selected].map((permission) => (
                    <Badge key={permission} variant="default">
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
                    <span className="py-1 font-sans text-sm italic text-text-secondary">
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
