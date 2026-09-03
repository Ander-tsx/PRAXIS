'use client';

import { updateProfileAction } from '@/app/(private)/settings/actions';
import { UPDATE_PROFILE_INITIAL_STATE } from '@/lib/action-state';
import { NAME_MAX, validateProfile } from '@/lib/validation';
import { Button, Input, alpha, colors, useAccion } from '@praxis/commons';
import { useId, useState } from 'react';

export interface ProfileFormProps {
  initialFirstName: string;
  initialLastName: string;
}

/**
 * Formulario de datos del usuario: nombre y apellido, que es todo lo que
 * `PATCH /users/:id` acepta.
 *
 * ⚠️ **El correo ya no está aquí.** No se edita —vive en la credencial y no hay
 * endpoint que lo cambie— y estaba puesto como un `<input>` deshabilitado, que
 * es una fila de formulario entera para algo que nadie puede tocar. El dato y
 * su motivo se conservan, en la ficha de la portada (`AccountIdentity`).
 *
 * La tarjeta tampoco es suya: la pone `PanelCard`, que es lo que permite
 * ponerla al lado de otra en la rejilla de la pantalla.
 */
export function ProfileForm({ initialFirstName, initialLastName }: ProfileFormProps) {
  const [state, formAction, pending] = useAccion(updateProfileAction, UPDATE_PROFILE_INITIAL_STATE);

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [touched, setTouched] = useState(false);

  const firstNameId = useId();
  const lastNameId = useId();

  const clientError = validateProfile({ firstName, lastName });

  return (
    <form
      action={formAction}
      /** La validación y el mensaje son nuestros; ver `CreateProjectForm/project-form.ts`. */
      noValidate
      onSubmit={(event) => {
        setTouched(true);
        if (clientError) event.preventDefault();
      }}
      /* `flex-1` y el botón al final: dentro de la rejilla, esta tarjeta y la
         de al lado miden lo mismo, así que el formulario estira y la acción se
         queda anclada abajo en vez de dejar un hueco debajo. */
      className="flex flex-1 flex-col gap-5"
    >
      {/**
       * Apilados, y no en fila.
       *
       * Estuvieron uno al lado del otro porque la tarjeta ocupaba el ancho
       * entero y dos campos cortos a la izquierda dejaban medio renglón vacío.
       * Ahora la tarjeta es la columna estrecha de la rejilla: en fila, cada
       * campo se quedaría en ~250 px, y el alto que ganan apilados es
       * justamente lo que iguala esta tarjeta con la de al lado.
       */}
      <div className="grid grid-cols-1 gap-5">
        <Input
          id={firstNameId}
          name="firstName"
          label="Nombre"
          placeholder="Andrés"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          maxLength={NAME_MAX}
          autoComplete="given-name"
          variant={touched && clientError ? 'error' : 'default'}
          fullWidth
        />

        <Input
          id={lastNameId}
          name="lastName"
          label="Apellido"
          placeholder="Ramírez"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          maxLength={NAME_MAX}
          autoComplete="family-name"
          variant={touched && clientError ? 'error' : 'default'}
          message={touched && clientError ? clientError : undefined}
          fullWidth
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
          style={{ background: alpha(colors.error, 10), borderColor: alpha(colors.error, 30) }}
        >
          {state.error}
        </p>
      )}

      {state.savedName && !state.error && (
        /* `<output>` es el elemento con semántica de `role="status"`. */
        <output
          className="rounded-lg border px-3 py-2 font-sans text-sm text-success"
          style={{ background: alpha(colors.success, 10), borderColor: alpha(colors.success, 30) }}
        >
          Listo, {state.savedName}. Tus datos quedaron guardados.
        </output>
      )}

      <div className="mt-auto flex justify-end">
        <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
