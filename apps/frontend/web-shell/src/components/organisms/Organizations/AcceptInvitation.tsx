'use client';

import { aceptarInvitacionAction } from '@/app/(privado)/main/team/actions';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/main/action-state';
import { Button, useAccion } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Aceptar una invitación desde el enlace del correo.
 *
 * ⚠️ **El correo con el que se entra es el de la sesión, no el del enlace.** El
 * backend comprueba que quien acepta sea a quien se invitó; si esa dirección
 * viniera de aquí, la comprobación sería una formalidad y bastaría con reenviar
 * el enlace para entrar en la organización de otro.
 *
 * Por eso lo único que viaja es el token, y por eso este botón exige sesión: no
 * hay forma de aceptar sin cuenta, y decirlo antes ahorra el viaje.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useAccion(
    aceptarInvitacionAction,
    ORGANIZACION_INITIAL_STATE,
  );

  useEffect(() => {
    if (state.done) router.push(`/main/organizations/${state.done}`);
  }, [state.done, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <p className="font-sans text-sm text-white">
        Te han invitado a una organización de PRAXIS. Al aceptar, su plan pasa a ser el tuyo
        mientras estés dentro; tus proyectos no cambian de sitio.
      </p>

      {state.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" isLoading={pending}>
          Aceptar invitación
        </Button>
      </div>
    </form>
  );
}
