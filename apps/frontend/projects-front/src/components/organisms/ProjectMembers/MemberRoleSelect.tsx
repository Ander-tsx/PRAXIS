'use client';

import type { ProjectRole } from '@praxis/commons';
import { useActionState, useEffect, useRef } from 'react';
import { changeMemberRoleAction } from '@/app/(private)/[id]/actions';
import { MEMBER_INITIAL_STATE } from '@/lib/action-state';

/**
 * El rol de un miembro, editable en su propia fila.
 *
 * **No hay botón de guardar.** Cambiar el rol de alguien es una elección entre
 * opciones cerradas, no un formulario: al soltar el desplegable ya está dicho
 * lo que se quiere, y un «Guardar» al lado solo añade un paso y la posibilidad
 * de dejarlo a medias creyendo que se aplicó.
 *
 * Se envía con `requestSubmit()` desde el `onChange` en vez de con un `onClick`
 * a la acción, para que el formulario siga funcionando sin JavaScript: es el
 * mismo patrón que el resto de esta pantalla.
 *
 * Quien no puede gestionar el equipo ve el rol como texto y no como control —lo
 * decide `ProjectMembers`, que es quien conoce el permiso—, así que aquí se da
 * por hecho que sí se puede.
 */
export function MemberRoleSelect({
  projectId,
  userId,
  roles,
  currentRoleId,
  label,
}: {
  projectId: string;
  userId: string;
  roles: ProjectRole[];
  currentRoleId: string;
  /** Nombre de la persona, para el texto accesible. */
  label: string;
}) {
  const [state, action, pending] = useActionState(
    changeMemberRoleAction,
    MEMBER_INITIAL_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  /**
   * Si el servidor rechaza el cambio, el desplegable vuelve al rol que había.
   *
   * Sin esto se queda enseñando el rol nuevo con un error al lado, que es la
   * peor combinación posible: dice a la vez que se aplicó y que no.
   */
  useEffect(() => {
    if (state.error && selectRef.current) selectRef.current.value = currentRoleId;
  }, [state.error, currentRoleId]);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="userId" value={userId} />

      <select
        ref={selectRef}
        name="projectRoleId"
        defaultValue={currentRoleId}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label={`Rol de ${label}`}
        title={state.error ?? `Rol de ${label}`}
        className="rounded-lg border border-border bg-background px-2 py-1 font-sans text-xs text-text-primary outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      >
        {roles.map((rol) => (
          <option key={rol.id} value={rol.id}>
            {rol.name}
          </option>
        ))}
      </select>

      {/* El error va aquí y no en un aviso global: quien lo lee necesita saber
          de qué fila habla, y la fila es donde está mirando. */}
      {state.error && (
        <span className="font-sans text-xs text-error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
