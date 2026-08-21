import { setPresenceAction } from '@/app/(private)/presence-actions';
import { AppShell, PresenceFooter, avatarHref, displayName } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { CuentaEnCabecera } from '@praxis/commons/organisms/AppLayout/CuentaEnCabecera';
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
  const { profile, roles, navItems } = await loadPrivateChrome();
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
        avatarSrc: avatarHref(profile.avatarUrl, '/projects/api/gateway'),
        presence: profile.presence ?? null,
      }}
      /* El selector de estado se dibuja sobre la esquina del avatar: la
         esfera **es** el botón. Ver `PresenceFooter`. */
      estadoSlot={<PresenceFooter presencia={profile.presence} onCambiar={setPresenceAction} />}
      /* Rol global y plan, arriba a la derecha de todas las pantallas de la
         zona. Va aquí y no en cada página: no cambia al navegar. */
      cuentaSlot={<CuentaEnCabecera roles={roles} />}
    >
      {children}
    </AppShell>
  );
}
