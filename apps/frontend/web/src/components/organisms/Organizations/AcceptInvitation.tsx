'use client';

import { aceptarInvitacionAction } from '@/app/(privado)/main/team/actions';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/main/action-state';
import { Button, useAccion } from '@praxis/commons';
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
 *
 * ## Directamente en la página, no dentro de una tarjeta
 *
 * Vivía envuelta en un `NoticePanel` —el mismo borde con esquinas redondeadas
 * que un aviso de tarea vencida—, y aquí no había nada que avisar: es una
 * pantalla propia a la que solo se llega desde un enlace, no una fila entre
 * otras del panel. Ahora sigue el mismo lenguaje que «Nueva organización»
 * (`main/organizations/new`): una frase grande en serif, las filas numeradas
 * con raya punteada de §4, y el formulario colgando de un `border-t`, no de
 * una caja propia.
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h2 className="font-sans font-semibold text-2xl leading-tight text-text-primary">
          Te han invitado a una organización
        </h2>
        <p className="max-w-xl font-sans text-base text-white">
          Solo entras si aceptas. Nadie te ha metido todavía.
        </p>
      </div>

      {/* El dispositivo de §4: número a la izquierda, texto al centro, raya
          punteada entre filas. Ni una tarjeta. */}
      <ol className="flex flex-col">
        <Razon
          n="01"
          titulo="Su plan pasa a ser el tuyo"
          texto="Mientras estés dentro, y ocupas uno de sus asientos."
        />
        <Razon
          n="02"
          titulo="Tus proyectos no cambian de sitio"
          texto="Siguen en la organización donde estaban."
        />
        <Razon
          n="03"
          titulo="Puedes cambiar de organización cuando quieras"
          texto="Desde el selector de la barra lateral."
        />
      </ol>

      <form action={formAction} className="flex flex-col gap-5 border-t border-border pt-8">
        <input type="hidden" name="token" value={token} />

        {state.error && (
          <p role="alert" className="font-sans text-sm text-error">
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button type="submit" isLoading={pending}>
            Aceptar invitación
          </Button>
          <span className="font-sans text-xs text-white">
            Te llevamos a tus proyectos al entrar.
          </span>
        </div>
      </form>
    </div>
  );
}

/** Una fila de «qué pasa si aceptas», igual que en «Nueva organización». */
function Razon({ n, titulo, texto }: { n: string; titulo: string; texto: string }) {
  return (
    <li className="flex items-baseline gap-5 border-b border-dotted border-border py-5 last:border-b-0">
      <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-white">{n}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-sans font-semibold text-lg text-text-primary">{titulo}</span>
        <span className="font-sans text-sm text-white">{texto}</span>
      </span>
    </li>
  );
}
