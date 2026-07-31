'use client';

import { type ProjectRole, Select } from '@praxis/commons';
import { useActionState, useRef, useState } from 'react';
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
 * Se envía con `requestSubmit()` al elegir, no con un `onClick` a la acción:
 * así el formulario sigue siendo un formulario y la acción recibe su `FormData`
 * como el resto de la pantalla.
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

  /**
   * El rol elegido, controlado aquí.
   *
   * Si el servidor rechaza el cambio vuelve al que había: dejarlo enseñando el
   * nuevo con un error al lado sería la peor combinación posible, porque diría
   * a la vez que se aplicó y que no.
   */
  const [rolId, setRolId] = useState(currentRoleId);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="userId" value={userId} />

      <Select
        name="projectRoleId"
        value={rolId}
        disabled={pending}
        onValueChange={(valor) => {
          setRolId(valor);
          /* En el microtask siguiente: el input oculto del Select tiene que
             haber recibido el valor nuevo antes de que se envíe el formulario. */
          queueMicrotask(() => formRef.current?.requestSubmit());
        }}
        options={roles.map((rol) => ({ value: rol.id, label: rol.name }))}
        className="h-8 min-w-36 text-xs"
      />

      {/* El error va aquí y no en un aviso global: quien lo lee necesita saber
          de qué fila habla, y la fila es donde está mirando. */}
      {state.error && (
        <span className="font-sans text-xs text-error" role="alert">
          {state.error}
        </span>
      )}
      <Revertir cuando={state.error} a={currentRoleId} aplicar={setRolId} />
    </form>
  );
}

/**
 * Devuelve el desplegable a su valor anterior cuando el servidor rechaza.
 *
 * Es un componente y no un `useEffect` en el cuerpo para que la dependencia sea
 * explícita: solo tiene que dispararse cuando **aparece** un error, no en cada
 * render que tenga uno.
 */
function Revertir({
  cuando,
  a,
  aplicar,
}: {
  cuando: string | null;
  a: string;
  aplicar: (valor: string) => void;
}) {
  const visto = useRef<string | null>(null);
  if (cuando && visto.current !== cuando) {
    visto.current = cuando;
    queueMicrotask(() => aplicar(a));
  }
  return null;
}
