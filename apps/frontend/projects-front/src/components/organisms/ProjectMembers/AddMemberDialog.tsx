'use client';

import {
  Button,
  Dialog,
  Input,
  Select,
  type ProjectRole,
  type UserProfile,
  alpha,
  colors,
  displayName,
} from '@praxis/commons';
import { useActionState, useEffect, useId, useMemo, useState } from 'react';
import { addMemberAction } from '@/app/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/action-state';

export interface AddMemberDialogProps {
  projectId: string;
  roles: ProjectRole[];
  /** Ya excluye a quienes son miembros. */
  candidates: UserProfile[];
}

/**
 * Añadir a alguien al proyecto.
 *
 * El endpoint recibe un `userId`, no un correo, así que la búsqueda se hace
 * **en el cliente** sobre el directorio que ya trajo la página. Es una
 * limitación real: `GET /users` recibe los filtros por body en un GET, así que
 * solo tenemos la primera página. Con pocos usuarios va; con muchos habría que
 * arreglar ese endpoint. Ver PENDIENTES-BACKEND §4 y §12.
 */
export function AddMemberDialog({ projectId, roles, candidates }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addMemberAction, MEMBER_INITIAL_STATE);

  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');

  const searchId = useId();
  const roleFieldId = useId();

  useEffect(() => {
    if (state.done) {
      setOpen(false);
      setQuery('');
      setUserId('');
    }
  }, [state.done]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle
      ? candidates.filter((user) => {
          const name = displayName(user).toLowerCase();
          return user.credential.email.toLowerCase().includes(needle) || name.includes(needle);
        })
      : candidates;
    return pool.slice(0, 8);
  }, [candidates, query]);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={roles.length === 0}>
        Añadir persona
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Añadir persona"
        description="Entra al proyecto de inmediato con el rol que elijas. No recibe ninguna invitación."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="userId" value={userId} />

          <Input
            id={searchId}
            type="search"
            label="Buscar"
            placeholder="Correo o nombre"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setUserId('');
            }}
            message="Solo aparecen personas que ya tienen cuenta en PRAXIS."
            autoComplete="off"
            fullWidth
          />

          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-1 font-sans text-sm text-text-disabled">
                {candidates.length === 0
                  ? 'Todas las personas del directorio ya están en el proyecto.'
                  : 'Nadie coincide con esa búsqueda.'}
              </p>
            ) : (
              matches.map((user) => {
                const name = displayName(user);
                const isSelected = userId === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setUserId(user.id)}
                    className={[
                      'flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'border-primary'
                        : 'border-border hover:border-border-strong hover:bg-surface-elevated',
                    ].join(' ')}
                    style={isSelected ? { background: alpha(colors.primary, 10) } : undefined}
                  >
                    {name && (
                      <span className="font-sans text-sm text-text-primary">{name}</span>
                    )}
                    <span className="font-sans text-xs text-text-secondary">
                      {user.credential.email}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <Select
            id={roleFieldId}
            name="projectRoleId"
            label="Rol"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            options={roles.map((role) => ({ value: role.id, label: role.name }))}
            message="Decide lo que podrá hacer dentro del proyecto."
            fullWidth
          />

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
            <Button type="submit" isLoading={pending} disabled={!userId || !roleId}>
              Añadir al proyecto
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
