import { setPresenceAction } from '@/app/(private)/presence-actions';
import { AppShell, PresenceFooter, displayName, hrefDeAvatar } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { getSidebarPlegada } from '@praxis/commons/theme';

/**
 * Armazón de la zona: barra lateral y cajón móvil, una sola vez.
 *
 * El armazón en dos piezas (§23): `AppShell` aquí y `AppHeader` en cada page.
 * Montado dentro de las páginas, navegar entre pestañas lo desmontaría y el
 * `loading.tsx` pintaría de esqueletos la barra lateral entera.
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
      zonePath="/reports"
      plegadaInicial={plegada}
      user={{
        name: displayName(profile),
        email: profile.credential.email,
        avatarSrc: hrefDeAvatar(profile.avatarUrl, '/reports/api/gateway'),
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
