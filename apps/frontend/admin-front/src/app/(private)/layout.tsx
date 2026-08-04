import { AppHeader, AppShell, LogoutButton, displayName, hasAdminRole } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { AccessDenied } from '@/components/organisms/AccessDenied';

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
  const { profile, roles, navItems } = await loadPrivateChrome();

  return (
    <AppShell
      navItems={navItems}
      zonePath="/admin"
      user={{ name: displayName(profile), email: profile.credential.email }}
      footerSlot={<LogoutButton />}
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
