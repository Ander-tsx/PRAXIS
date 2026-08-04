import { AppShell, LogoutButton, displayName } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';

/**
 * Armazón de la zona: barra lateral y cajón móvil, una sola vez.
 *
 * El armazón en dos piezas (§23): `AppShell` aquí y `AppHeader` en cada page.
 * Montado dentro de las páginas, navegar entre pestañas lo desmontaría y el
 * `loading.tsx` pintaría de esqueletos la barra lateral entera.
 */
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { profile, navItems } = await loadPrivateChrome();

  return (
    <AppShell
      navItems={navItems}
      zonePath="/reports"
      user={{ name: displayName(profile), email: profile.credential.email }}
      footerSlot={<LogoutButton />}
    >
      {children}
    </AppShell>
  );
}
