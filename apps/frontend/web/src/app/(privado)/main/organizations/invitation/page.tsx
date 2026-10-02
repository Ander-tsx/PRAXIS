import { AcceptInvitation } from '@/components/organisms/Organizations';
import { AppHeader } from '@praxis/commons';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invitación',
};

/**
 * La pantalla a la que lleva el enlace de una invitación.
 *
 * Cuelga de `(private)`, así que quien llegue sin sesión pasa antes por el
 * login y vuelve aquí: aceptar una invitación es atar una organización a **una
 * cuenta**, y sin cuenta no hay nada que atar.
 */
export default async function InvitacionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AppHeader title="Invitación">
      {/* La cabecera dice solo «Invitación»: el panel de dentro ya dice de qué
          organización y qué pasa al aceptar, y repetirlo arriba dejaba el mismo
          texto dos veces en la misma pantalla. */}
      {token ? (
        <AcceptInvitation token={token} />
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          <h2 className="font-sans font-semibold text-2xl leading-tight text-text-primary">
            Este enlace está incompleto
          </h2>
          <p className="max-w-xl font-sans text-base text-white">
            No trae el código de la invitación, así que no hay nada que aceptar. Pide que te lo
            vuelvan a enviar: el anterior sigue valiendo mientras no caduque.
          </p>
        </div>
      )}
    </AppHeader>
  );
}
