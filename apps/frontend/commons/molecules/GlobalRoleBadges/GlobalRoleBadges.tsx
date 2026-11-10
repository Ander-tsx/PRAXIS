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
import { alpha, colors } from '../../tokens';

export function GlobalRoleBadges({ roles }: GlobalRoleBadgesProps) {
  return (
    <>
      {roles.map((role) => {
        const color = role === 'User' ? colors.primary : colors.accent;
        return (
          <span
            key={role}
            className="inline-flex items-center justify-center font-sans font-bold uppercase tracking-widest text-[10px] rounded-full px-3 py-1"
            style={{
              backgroundColor: alpha(color, 20),
              color: color,
              border: `1px solid ${alpha(color, 30)}`,
            }}
          >
            {role}
          </span>
        );
      })}
    </>
  );
}
