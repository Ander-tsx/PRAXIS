import { setPresenceAction } from '@/app/(private)/presence-actions';
import { AccessDenied } from '@/components/organisms/AccessDenied';
import {
  AppHeader,
  AppShell,
  PresenceFooter,
  avatarHref,
  displayName,
  hasAdminRole,
} from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { CuentaEnCabecera } from '@praxis/commons/organisms/AppLayout/CuentaEnCabecera';
import { getSidebarPlegada } from '@praxis/commons/theme';

/**
 * Armazón de la zona, y **la puerta del rol**.
 *
 * ## Por qué el rol se comprueba aquí y no en `proxy.ts`
 *
 * 1. El proxy corre en **cada navegación** y saber el rol exige preguntar al
 *    gateway. Este layout ya está pidiendo el usuario de todas formas, y Next lo
 *    conserva entre navegaciones de la zona: una comprobación por visita, no una
 *    por pantalla.
 * 2. Desde aquí se puede **explicar**. Un rebote silencioso al panel se lee como
 *    un enlace roto; `AccessDenied` dice qué pasa. Es el criterio de
 *    `NoReportsAccess` en Análisis (ESTADO-ACTUAL §29.3).
 *
 * Al estar en el layout cubre **todas** las pantallas de la zona, presentes y
 * futuras: una página nueva no puede olvidarse de comprobarlo.
 *
 * ⚠️ Esto no es la autorización, es la interfaz. Quien la protege es el gateway,
 * que exige rol `Admin` en las cuatro rutas de `/api/admin`. Si esta
 * comprobación desapareciera, un usuario normal vería la cáscara del panel con
 * las tablas vacías y un error — no los datos.
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
      zonePath="/admin"
      plegadaInicial={plegada}
      /* El selector de organización de la barra: la lista y cuál se mira. Las
         dos las resuelve `loadPrivateChrome`, así que aquí no cuestan nada. */
      organizaciones={organizaciones}
      organizacionActivaId={organizacionActivaId}
      user={{
        name: displayName(profile),
        email: profile.credential.email,
        avatarSrc: avatarHref(profile.avatarUrl, '/admin/api/gateway'),
        presence: profile.presence ?? null,
      }}
      /* El selector de estado se dibuja sobre la esquina del avatar: la
         esfera **es** el botón. Ver `PresenceFooter`. */
      estadoSlot={<PresenceFooter presencia={profile.presence} onCambiar={setPresenceAction} />}
      /* Rol global y plan, arriba a la derecha de todas las pantallas de la
         zona. Va aquí y no en cada página: no cambia al navegar. */
      cuentaSlot={<CuentaEnCabecera roles={roles} />}
    >
      {hasAdminRole(roles) ? (
        children
      ) : (
        <AppHeader title="Administración">
          <AccessDenied />
        </AppHeader>
      )}
    </AppShell>
  );
}
