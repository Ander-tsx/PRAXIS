'use client';

import { Button, Input, alpha, colors } from '@praxis/commons';
import { useActionState, useId, useState } from 'react';
import { updateProfileAction } from '@/app/(private)/perfil/actions';
import { UPDATE_PROFILE_INITIAL_STATE } from '@/lib/action-state';
import { NAME_MAX, validateProfile } from '@/lib/validation';

export interface ProfileFormProps {
  email: string;
  initialFirstName: string;
  initialLastName: string;
}

/**
 * Formulario de datos del usuario.
 *
 * El email no se edita: vive en la credencial y `PATCH /users/:id` no lo toca.
 * Se muestra deshabilitado para que quede claro de qué cuenta hablamos.
 */
export function ProfileForm({ email, initialFirstName, initialLastName }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    UPDATE_PROFILE_INITIAL_STATE,
  );

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [touched, setTouched] = useState(false);

  const firstNameId = useId();
  const lastNameId = useId();
  const emailId = useId();

  const clientError = validateProfile({ firstName, lastName });

  return (
    <form
      action={formAction}
      /** La validación y el mensaje son nuestros; ver CreateProjectDialog. */
      noValidate
      onSubmit={(event) => {
        setTouched(true);
        if (clientError) event.preventDefault();
      }}
      className="flex max-w-xl flex-col gap-5 rounded-2xl border border-border bg-surface p-6"
    >
      <Input
        id={emailId}
        label="Correo"
        value={email}
        disabled
        readOnly
        message="El correo pertenece a tus credenciales y no se edita desde aquí."
        fullWidth
      />

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

      <div className="flex justify-end">
        <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
