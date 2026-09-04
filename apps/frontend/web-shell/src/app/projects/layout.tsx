import { setPresenceAction } from '@/app/projects/presence-actions';
import { AppShell, PresenceFooter, avatarHref, displayName } from '@praxis/commons';
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
      /* Vacío, no `"/projects"`: sin `basePath`, `usePathname()` ya devuelve la
         ruta entera y el proxy es `/api/gateway`. Ver `app/assistant/layout.tsx`. */
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
