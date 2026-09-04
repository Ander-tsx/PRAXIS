import { setPresenceAction } from '@/app/main/profile/actions';
import { AppShell, PresenceFooter, avatarHref, displayName } from '@praxis/commons';
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
  const {
    profile,
    navItems,
    organizaciones,
    organizacionActivaId,
    mensajesSinLeer,
    avisosSinLeer,
  } = await loadPrivateChrome();
  /* La cookie del pliegue, leída en el servidor: sin esto la barra se
     serviría desplegada y se plegaría al hidratar, parpadeando en cada
     navegación —y en Multi-Zones cada cambio de zona es una carga entera. */
  const plegada = await getSidebarPlegada();

  return (
    <AppShell
      navItems={navItems}
      /* Vacío, no `"/main"`: sin `basePath`, `usePathname()` ya devuelve la ruta
         entera y el proxy es `/api/gateway`. Ver `app/assistant/layout.tsx`. */
      zonePath=""
      plegadaInicial={plegada}
      /* El selector de organización de la barra: la lista y cuál se mira. Las
         dos las resuelve `loadPrivateChrome`, así que aquí no cuestan nada. */
      organizaciones={organizaciones}
      organizacionActivaId={organizacionActivaId}
      /* Las dos insignias de las pestañas de la barra: `loadPrivateChrome` ya
         las trae, y a partir de aquí las mantiene vivas el propio armazón
         escuchando el flujo. Ver `AppShellProps.mensajesSinLeer`. */
      mensajesSinLeer={mensajesSinLeer}
      avisosSinLeer={avisosSinLeer}
      user={{
        name: displayName(profile),
        email: profile.credential.email,
        avatarSrc: avatarHref(profile.avatarUrl, '/api/gateway'),
        presence: profile.presence ?? null,
      }}
      /* El selector de estado se dibuja sobre la esquina del avatar: la
         esfera **es** el botón. Ver `PresenceFooter`. */
      estadoSlot={<PresenceFooter presencia={profile.presence} onCambiar={setPresenceAction} />}
    >
      {children}
    </AppShell>
  );
}
