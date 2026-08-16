import { setPresenceAction } from '@/app/(private)/presence-actions';
import { AppShell, PresenceFooter, displayName, hrefDeAvatar } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { getSidebarPlegada } from '@praxis/commons/theme';

/**
 * Armazón de la zona: barra lateral y cajón móvil, una sola vez.
 *
 * Igual que en el panel, y por el mismo motivo: montado dentro de cada page, el
 * armazón se desmontaba al navegar y el `loading.tsx` pintaba de esqueletos la
 * barra lateral entera —enlaces, nombre, correo y cerrar sesión—, cosas que no
 * dependen de la pantalla. En el layout, Next lo conserva entre navegaciones.
 *
 * El grupo `(private)` no aparece en la URL: solo sirve para envolver.
 */
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { profile, navItems } = await loadPrivateChrome();
  /* La cookie del pliegue, leída en el servidor: sin esto la barra se
     serviría desplegada y se plegaría al hidratar, parpadeando en cada
     navegación —y en Multi-Zones cada cambio de zona es una carga entera. */
  const plegada = await getSidebarPlegada();

  return (
    <AppShell
      navItems={navItems}
      zonePath="/projects"
      plegadaInicial={plegada}
      user={{
        name: displayName(profile),
        email: profile.credential.email,
        avatarSrc: hrefDeAvatar(profile.avatarUrl, '/projects/api/gateway'),
        presence: profile.presence ?? null,
      }}
      /* «Cerrar sesión» se fue a la pantalla de cuenta, a la que se llega
         pulsando la ficha de arriba. Aquí queda el cambio de estado, que es
         lo que sí se toca varias veces al día. */
      footerSlot={<PresenceFooter presencia={profile.presence} onCambiar={setPresenceAction} />}
    >
      {children}
    </AppShell>
  );
}
