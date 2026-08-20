'use client';

import { saveRoleAction } from '@/app/(private)/[id]/actions';
import { ROLE_INITIAL_STATE } from '@/lib/action-state';
import { ROLE_NAME_MAX, validateRole } from '@/lib/validation';
import {
  Button,
  Checkbox,
  Dialog,
  Input,
  type ProjectPermission,
  type ProjectRole,
  alpha,
  colors,
  useAccion,
} from '@praxis/commons';
import { useEffect, useId, useState } from 'react';
import { PERMISSION_GROUPS, PERMISSION_LABELS, impliedFrom, selectedFrom } from './permissions';

export interface RoleFormProps {
  projectId: string;
  role?: ProjectRole;
  onCancel: () => void;
  onSuccess?: () => void;
}

export function RoleForm({
  projectId,
  role,
  onCancel,
  onSuccess,
}: RoleFormProps) {
  const [state, formAction, pending] = useAccion(saveRoleAction, ROLE_INITIAL_STATE);

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
      setTouched(false);
      onSuccess?.();
    }
  }, [state, onSuccess]);

  function toggle(permission: ProjectPermission) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface-elevated p-6 shadow-md ring-2 ring-primary/20">
      <header>
        <h4 className="font-sans text-lg font-semibold text-text-primary">
          {role ? `Editar «${role.name}»` : 'Nuevo rol'}
        </h4>
        <p className="font-sans text-xs text-text-secondary mt-1">
          Los permisos de mayor nivel conceden los de menor: marcar «eliminar» da también «editar» y «crear».
        </p>
      </header>
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

          <div className="flex flex-col gap-5 pr-1">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <span className="font-sans text-xs uppercase tracking-wider text-text-disabled">
                  {group.title}
                </span>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
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

        <div className="flex justify-end gap-3 mt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
            {role ? 'Guardar cambios' : 'Crear rol'}
          </Button>
        </div>
      </form>
    </div>
  );
}
