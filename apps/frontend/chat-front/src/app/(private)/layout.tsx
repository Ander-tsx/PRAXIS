import { setPresenceAction } from '@/app/(private)/presence-actions';
import { AppShell, PresenceFooter, avatarHref, displayName } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { getSidebarPlegada } from '@praxis/commons/theme';

/**
 * Armazón de la zona: barra lateral y cajón móvil, una sola vez.
 *
 * El armazón en dos piezas (§23): `AppShell` aquí y `AppHeader` en el layout de
 * `(conversaciones)`. Montado dentro de las páginas, navegar entre
 * conversaciones lo desmontaría y se pintaría de esqueletos la barra lateral
 * entera en cada clic.
 *
 * ⚠️ **Este layout faltaba y no lo dijo el compilador.** Al mudar el chat desde
 * dashboard-front (E3.3) se trajo su `chat/layout.tsx` —el que pinta `AppHeader`
 * y la columna de conversaciones— pero no el `(private)/layout.tsx` que lo
 * envolvía en aquella zona, que es quien monta el `AppShell`. `tsc` daba verde:
 * el contexto de React no es un tipo. La pantalla respondía **500** con
 * «useAppShell solo funciona dentro de \<AppShell\>» después de haber pintado
 * media página, que es de las formas más confusas de fallar que hay.
 *
 * Por eso las conversaciones cuelgan del grupo `(conversaciones)`: hacen falta
 * dos layouts encadenados —el de la zona y el del chat— y dos layouts no caben
 * en el mismo nivel. El grupo no añade nada a la URL.
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
      zonePath="/chat"
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
        avatarSrc: avatarHref(profile.avatarUrl, '/chat/api/gateway'),
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
