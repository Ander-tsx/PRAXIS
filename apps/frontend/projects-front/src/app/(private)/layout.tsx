import { AppShell, LogoutButton, displayName } from '@praxis/commons';
import { loadAppNavItems, loadCurrentUser } from '@praxis/commons/auth';

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
  const [{ profile }, navItems] = await Promise.all([loadCurrentUser(), loadAppNavItems()]);

  return (
    <AppShell
      navItems={navItems}
      zonePath="/projects"
      user={{ name: displayName(profile), email: profile.credential.email }}
      footerSlot={<LogoutButton />}
    >
      {children}
    </AppShell>
  );
}
