import { AppShell, LogoutButton, displayName } from '@praxis/commons';
import { loadAppNavItems, loadCurrentUser } from '@praxis/commons/auth';

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
  const [{ profile }, navItems] = await Promise.all([loadCurrentUser(), loadAppNavItems()]);

  return (
    <AppShell
      navItems={navItems}
      zonePath="/dashboard"
      user={{ name: displayName(profile), email: profile.credential.email }}
      footerSlot={<LogoutButton />}
    >
      {children}
    </AppShell>
  );
}
