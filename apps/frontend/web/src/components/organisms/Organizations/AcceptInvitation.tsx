'use client';

import { aceptarInvitacionAction } from '@/app/(privado)/main/team/actions';
import { NoticePanel } from '@/components/molecules/NoticePanel';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/main/action-state';
import { Button, alpha, colors, useAccion } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * A dónde se sale después de entrar en la organización.
 *
 * 🔴 **Era `/main/organizations/:id`, y esa pantalla no existe.** Nunca llegó a
 * escribirse: bajo `main/organizations` solo hay `invitation` y `new`. Aceptar
 * una invitación terminaba en un 404 —el peor sitio posible para dejar a alguien
 * que acaba de entrar en un equipo, porque la acción **sí había funcionado** y
 * la pantalla dice lo contrario—.
 *
 * Ahora se sale a los proyectos, que es lo que se viene a ver: la organización
 * es el sitio donde viven, no un destino en sí mismo.
 */
const DESTINO_TRAS_ACEPTAR = '/projects';

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
 *
 * ## Y al salir se deja activa la organización a la que se acaba de entrar
 *
 * ⚠️ Sin eso, la redirección lleva a un tablero **vacío**: la cookie
 * `praxis_org` sigue apuntando a la personal, todo cuelga de la activa desde
 * `PLAN-ORGANIZACION-ACTIVA`, y quien acaba de aceptar ve cero proyectos justo
 * después de que le dijeran que ya está dentro. Se escribe igual que en
 * `OrgSwitcher` —y por el mismo motivo de que un Server Component no puede—:
 * la cookie es un **filtro sobre lo que ya puedes ver**, nunca una llave.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useAccion(
    aceptarInvitacionAction,
    ORGANIZACION_INITIAL_STATE,
  );

  useEffect(() => {
    if (!state.done) return;
    document.cookie = `praxis_org=${state.done}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.push(DESTINO_TRAS_ACEPTAR);
  }, [state.done, router]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* El mismo `NoticePanel` que las invitaciones a un proyecto, y por el
          mismo motivo: son la misma clase de cosa —algo que espera una
          decisión—. Antes esto era un párrafo suelto y un botón sobre el fondo
          desnudo, así que la invitación de más peso del producto se veía peor
          que la de un proyecto. El tono es `accent`, el de «esto espera a que
          decidas», igual que allí. */}
      <NoticePanel
        tone={colors.accent}
        icon={<InvitationIcon />}
        title="Te han invitado a una organización"
        hint="Solo entras si aceptas. Nadie te ha metido todavía."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />

          <ul
            className="flex flex-col gap-2.5 rounded-xl p-4"
            style={{ background: alpha(colors.border, 30) }}
          >
            <Punto>
              Su <strong className="font-medium text-text-primary">plan pasa a ser el tuyo</strong>{' '}
              mientras estés dentro, y ocupas uno de sus asientos.
            </Punto>
            <Punto>
              Tus proyectos{' '}
              <strong className="font-medium text-text-primary">no cambian de sitio</strong>: siguen
              en la organización donde estaban.
            </Punto>
            <Punto>
              Podrás cambiar de organización cuando quieras desde el selector de la barra lateral.
            </Punto>
          </ul>

          {state.error && (
            <p
              role="alert"
              className="rounded-xl border px-4 py-3 font-sans text-sm"
              style={{
                borderColor: alpha(colors.error, 25),
                background: alpha(colors.error, 8),
                color: colors.error,
              }}
            >
              {state.error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" isLoading={pending}>
              Aceptar invitación
            </Button>
            <span className="font-sans text-xs text-text-secondary">
              Te llevamos a tus proyectos al entrar.
            </span>
          </div>
        </form>
      </NoticePanel>
    </div>
  );
}

/** Una línea de «qué pasa si aceptas», con su punto delante. */
function Punto({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 font-sans text-sm text-white">
      <span
        aria-hidden="true"
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: colors.accent }}
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** Sobre: el mismo de `MyInvitations`, para que las dos invitaciones se reconozcan. */
function InvitationIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.9 5.3a2 2 0 002.2 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}
