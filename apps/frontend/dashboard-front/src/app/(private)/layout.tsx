import { setPresenceAction } from '@/app/(private)/profile/actions';
import { AppShell, PresenceFooter, avatarHref, displayName } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { CuentaEnCabecera } from '@praxis/commons/organisms/AppLayout/CuentaEnCabecera';
import { getSidebarPlegada } from '@praxis/commons/theme';

/**
 * Armazón de la zona: barra lateral y cajón móvil, una sola vez.
 *
 * Está en el layout y no en cada page **para que no se vuelva a renderizar al
 * navegar**. Antes cada pantalla montaba el armazón entero, así que cambiar de
 * pestaña lo desmontaba y el `loading.tsx` enseñaba una barra lateral de
 * esqueletos: parpadeaban los enlaces, el nombre y el correo de quien ya estaba
 * dentro, y el botón de cerrar sesión. Nada de eso depende de la pantalla.
 *
 * Next conserva los layouts entre navegaciones del mismo segmento, así que estas
 * dos peticiones ocurren **una vez por visita a la zona**, no una por pantalla.
 *
 * El grupo `(private)` no añade nada a la URL: existe solo para que este layout
 * envuelva a las pantallas sin tocar sus rutas.
 */
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { profile, roles, navItems, organizaciones, organizacionActivaId } =
    await loadPrivateChrome();
  /* La cookie del pliegue, leída en el servidor: sin esto la barra se
     serviría desplegada y se plegaría al hidratar, parpadeando en cada
     navegación —y en Multi-Zones cada cambio de zona es una carga entera. */
  const plegada = await getSidebarPlegada();

  return (
    <AppShell
      navItems={navItems}
      zonePath="/dashboard"
      plegadaInicial={plegada}
      /* El selector de organización de la barra: la lista y cuál se mira. Las
         dos las resuelve `loadPrivateChrome`, así que aquí no cuestan nada. */
      organizaciones={organizaciones}
      organizacionActivaId={organizacionActivaId}
      user={{
        name: displayName(profile),
        email: profile.credential.email,
        avatarSrc: avatarHref(profile.avatarUrl, '/dashboard/api/gateway'),
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
