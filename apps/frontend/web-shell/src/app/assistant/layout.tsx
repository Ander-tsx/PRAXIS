import { setPresenceAction } from '@/app/assistant/presence-actions';
import { AppShell, PresenceFooter, avatarHref, displayName } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { getSidebarPlegada } from '@praxis/commons/theme';

/**
 * Armazón del asistente: barra lateral y cajón móvil, una sola vez.
 *
 * ⚠️ **Esto era el `layout.tsx` del grupo `(private)` de `assistant-front`.**
 * Con F2 de la fusión de zonas la zona pasó a ser un segmento del shell, así
 * que aquí ya no hay `<html>` ni `<body>` ni fuentes: los pone el layout raíz.
 *
 * ⚠️ Y es **provisional**. En F8 los cinco segmentos privados comparten un
 * único `(privado)/layout.tsx`, que es el motivo entero de la fusión: hoy este
 * armazón se remonta al cambiar de sección, y con eso se rehacen la barra, el
 * proveedor del directorio de chats y **la conexión SSE**.
 *
 * El armazón en dos piezas (§23): `AppShell` aquí y `AppHeader` en cada page.
 * Montado dentro de las páginas, navegar entre pantallas lo desmontaría y el
 * `loading.tsx` pintaría de esqueletos la barra lateral entera.
 *
 * ## Aquí no se comprueba ningún permiso
 *
 * A diferencia del layout de `admin-front`, que además de la sesión exige rol.
 * PRAX no tiene puerta propia: cualquier cuenta con sesión entra. Lo que está
 * acotado es de **qué proyectos** puede hablar, y eso lo resuelve el selector
 * pidiendo `GET /projects?permission=canViewReports` — o sea, la misma línea que
 * ya aplica Análisis, comprobada por el gateway en cada llamada. Ver `proxy.ts`.
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
     navegación. */
  const plegada = await getSidebarPlegada();

  return (
    <AppShell
      navItems={navItems}
      /**
       * 🔴 **Vacío, y no `"/assistant"`.**
       *
       * `zonePath` hace dos trabajos en `AppShell`: prefijar el proxy
       * (`${zonePath}/api/gateway`) y **reconstruir la ruta del navegador**,
       * porque dentro de una zona `usePathname()` no incluye el `basePath`.
       *
       * Aquí ya no hay `basePath`: `usePathname()` devuelve `/assistant` tal
       * cual y el proxy vive en `/api/gateway`. La cadena vacía es exactamente
       * lo que necesitan los dos cálculos, así que `AppShell` no se toca y las
       * zonas movidas y las que faltan conviven sin ramas.
       */
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
