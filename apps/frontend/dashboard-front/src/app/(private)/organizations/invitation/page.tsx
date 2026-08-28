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
    <AppHeader title="Invitación a una organización">
      {token ? (
        <AcceptInvitation token={token} />
      ) : (
        <p className="font-sans text-sm text-text-secondary">
          Este enlace no trae el código de la invitación. Pide que te lo vuelvan a enviar: el
          anterior sigue valiendo mientras no caduque.
        </p>
      )}
    </AppHeader>
  );
}
