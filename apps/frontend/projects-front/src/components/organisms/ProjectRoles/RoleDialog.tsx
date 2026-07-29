'use client';

import {
  Button,
  Checkbox,
  Dialog,
  Input,
  type ProjectPermission,
  type ProjectRole,
  alpha,
  colors,
} from '@praxis/commons';
import { useActionState, useEffect, useId, useState } from 'react';
import { saveRoleAction } from '@/app/[id]/actions';
import { ROLE_INITIAL_STATE } from '@/lib/action-state';
import { ROLE_NAME_MAX, validateRole } from '@/lib/validation';
import { PERMISSION_GROUPS, PERMISSION_LABELS, impliedFrom, selectedFrom } from './permissions';

export interface RoleDialogProps {
  projectId: string;
  /** Sin rol, crea uno nuevo. */
  role?: ProjectRole;
  triggerLabel: string;
  /**
   * El disparador se declara con props y no con un render prop: `ProjectRoles`
   * es Server Component y **una función no cruza la frontera RSC**.
   */
  triggerVariant?: 'primary' | 'secondary' | 'ghost';
  triggerSize?: 'sm' | 'md';
}

export function RoleDialog({
  projectId,
  role,
  triggerLabel,
  triggerVariant = 'secondary',
  triggerSize = 'md',
}: RoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveRoleAction, ROLE_INITIAL_STATE);

  const [name, setName] = useState(role?.name ?? '');
  const [selected, setSelected] = useState<Set<ProjectPermission>>(
    role ? selectedFrom(role.permissions) : new Set(['canViewProject']),
  );
  const [touched, setTouched] = useState(false);

  const nameId = useId();
  const implied = impliedFrom(selected);
  const clientError = validateRole(name, selected.size);

  useEffect(() => {
    if (state.savedName) {
      setOpen(false);
      setTouched(false);
    }
  }, [state.savedName]);

  function toggle(permission: ProjectPermission) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={role ? `Editar «${role.name}»` : 'Nuevo rol'}
        description="Los permisos de mayor nivel conceden los de menor: marcar «eliminar» da también «editar» y «crear»."
      >
        <form
          action={formAction}
          noValidate
          onSubmit={(event) => {
            setTouched(true);
            if (clientError) event.preventDefault();
          }}
          className="flex flex-col gap-5"
        >
          <input type="hidden" name="projectId" value={projectId} />
          {role && <input type="hidden" name="roleId" value={role.id} />}

          <Input
            id={nameId}
            name="name"
            label="Nombre del rol"
            placeholder="Colaborador"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={ROLE_NAME_MAX}
            variant={touched && clientError ? 'error' : 'default'}
            message={touched && clientError ? clientError : undefined}
            autoComplete="off"
            fullWidth
          />

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 font-sans text-sm font-medium text-text-primary">
              Permisos
            </legend>

            <div className="flex max-h-[45vh] flex-col gap-5 overflow-y-auto pr-1">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-2">
                  <span className="font-sans text-xs uppercase tracking-wider text-text-disabled">
                    {group.title}
                  </span>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {group.permissions.map((permission) => {
                      const isImplied = implied.has(permission);
                      return (
                        <Checkbox
                          key={permission}
                          id={`${nameId}-${permission}`}
                          name="permissions"
                          value={permission}
                          label={PERMISSION_LABELS[permission]}
                          hint={isImplied ? 'Incluido por otro permiso' : undefined}
                          implied={isImplied}
                          checked={selected.has(permission) || isImplied}
                          onChange={() => toggle(permission)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          {state.error && (
            <p
              role="alert"
              className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
              style={{
                background: alpha(colors.error, 10),
                borderColor: alpha(colors.error, 30),
              }}
            >
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
              {role ? 'Guardar cambios' : 'Crear rol'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
