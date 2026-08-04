import { Badge, type BadgeVariant } from '../../atoms/Badge';

export interface GlobalRoleBadgesProps {
  /** Nombres de los roles globales, tal como los da `loadCurrentUser()`. */
  roles: readonly string[];
}

/**
 * Las insignias del rol global de **quien está mirando**.
 *
 * ⚠️ Solo para el rol propio. El rol global es privado por decisión de producto:
 * no se enseña en el directorio de usuarios ni en la lista de miembros de un
 * proyecto. El único sitio donde se ven los de otras personas es el panel de
 * administración.
 *
 * Existe porque las tres líneas que pintan esto estaban copiadas en el panel y
 * en Configuración, las dos con `role === 'Admin' ? 'accent' : 'primary'`. Al
 * añadir `SuperAdmin` esa comparación **dejó al rol más alto pintado como un
 * usuario corriente** en los dos sitios a la vez: el fallo típico de una regla
 * duplicada, que se arregla una vez y sigue mal en la otra.
 *
 * Una cuenta sin roles no pinta nada, que es el caso normal: `POST /auth/register`
 * no asigna ninguno.
 */
export function GlobalRoleBadges({ roles }: GlobalRoleBadgesProps) {
  return (
    <>
      {roles.map((role) => (
        <Badge key={role} variant={badgeVariant(role)}>
          {role.toUpperCase()}
        </Badge>
      ))}
    </>
  );
}

/**
 * Cualquier nivel de administración destaca; `User` y lo que no reconozcamos, no.
 *
 * En negativo a propósito —«todo lo que no sea User»— para que un rol nuevo por
 * encima salga destacado por defecto en vez de camuflado.
 */
function badgeVariant(role: string): BadgeVariant {
  return role === 'User' ? 'primary' : 'accent';
}
