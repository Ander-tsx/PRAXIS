import { setPresenceAction } from '@/app/(private)/perfil/actions';
import { AppShell, PresenceFooter, displayName, hrefDeAvatar } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
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
  const { profile, navItems } = await loadPrivateChrome();
  /* La cookie del pliegue, leída en el servidor: sin esto la barra se
     serviría desplegada y se plegaría al hidratar, parpadeando en cada
     navegación —y en Multi-Zones cada cambio de zona es una carga entera. */
  const plegada = await getSidebarPlegada();

  return (
    <AppShell
      navItems={navItems}
      zonePath="/dashboard"
      plegadaInicial={plegada}
      user={{
        name: displayName(profile),
        email: profile.credential.email,
        avatarSrc: hrefDeAvatar(profile.avatarUrl, '/dashboard/api/gateway'),
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
