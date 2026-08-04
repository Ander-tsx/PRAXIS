import { GlobalRoleBadges, alpha, colors } from '@praxis/commons';
import Link from 'next/link';

export interface DashboardWelcomeProps {
  /** Nombre completo. Vacío en cuentas recién creadas. */
  name: string;
  email: string;
  /** Roles globales del usuario (`GET /permissions/user/:id`). */
  roles: string[];
}

/**
 * Cabecera de bienvenida.
 *
 * El registro no pide nombre, así que **el caso normal de una cuenta nueva es
 * no tener nombre**. Cuando falta, saludamos con el email y ofrecemos
 * completar el perfil en lugar de mostrar un "Hola, " a medias.
 */
export function DashboardWelcome({ name, email, roles }: DashboardWelcomeProps) {
  const hasName = name.trim().length > 0;

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
          {hasName ? `Hola, ${name}` : 'Te damos la bienvenida'}
        </h2>

        <GlobalRoleBadges roles={roles} />
      </div>

      {hasName ? (
        <p className="font-serif text-lg italic text-text-secondary">
          Este es el estado de tus proyectos.
        </p>
      ) : (
        <div
          className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: alpha(colors.primary, 6) }}
        >
          <div className="flex flex-col gap-1">
            <p className="font-sans text-sm text-text-primary">
              Estás identificado como <span className="font-semibold">{email}</span>.
            </p>
            <p className="font-sans text-sm text-text-secondary">
              Al registrarte no te pedimos tu nombre. Añádelo para que tu equipo te reconozca.
            </p>
          </div>

          {/* Misma zona → `next/link`, y sin el basePath: Next le antepone
              `/dashboard` solo. Ver ESTADO-ACTUAL §16. */}
          <Link
            href="/settings"
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-center font-sans text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Completar perfil
          </Link>
        </div>
      )}
    </header>
  );
}
