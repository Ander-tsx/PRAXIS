import { AccessDenied } from '@/components/organisms/admin/AccessDenied';
import { AppHeader, hasAdminRole } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';

/**
 * La puerta de `/admin`: aquí se comprueba el **rol global**, no la sesión.
 *
 * La sesión ya la exigió el guard, y el armazón lo monta `(privado)/layout.tsx`.
 * Lo único propio de esta sección es quién puede entrar.
 *
 * ## Por qué el rol se comprueba aquí y no en el guard
 *
 * 1. El guard corre en **cada navegación**, y saber el rol exige preguntar al
 *    gateway. Este layout ya está pidiendo el usuario de todas formas.
 * 2. Un rebote silencioso al panel se lee como un enlace roto. Aquí se puede
 *    explicar por qué no se entra, que es lo que hace `AccessDenied` — el mismo
 *    criterio que tenía `NoReportsAccess` en Análisis (ESTADO-ACTUAL §29.3).
 *
 * ⚠️ Ni lo uno ni lo otro es la autorización de verdad: **la hace el gateway**,
 * que exige rol `Admin` en las rutas de `/api/admin`. Esconder la pantalla es
 * cortesía; lo que protege los datos está del otro lado.
 *
 * ⚠️ `AccessDenied` **no dice quién administra la plataforma**: el rol global es
 * privado, así que esta pantalla tampoco puede ser la rendija por la que se
 * averigua.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await loadPrivateChrome();

  if (!hasAdminRole(roles)) {
    return (
      <AppHeader title="Administración">
        <AccessDenied />
      </AppHeader>
    );
  }

  return <>{children}</>;
}
