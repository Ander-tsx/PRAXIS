import { APP_NAV_ITEMS, AppLayout, Badge, LogoutButton, displayName } from '@praxis/commons';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProfileForm } from '@/components/organisms/ProfileForm';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';

export const metadata: Metadata = {
  title: 'Tus datos',
};

/**
 * Datos del usuario.
 *
 * Existe porque el registro no pide nombre: sin esta pantalla, una cuenta
 * nueva no tendría forma de ponérselo. La escritura vive en `actions.ts`.
 */
export default async function ProfilePage() {
  const { profile, roles } = await loadCurrentUser();

  return (
    <AppLayout
      navItems={APP_NAV_ITEMS}
      /**
       * Ruta **pública**, con el basePath: `AppLayout` la compara con enlaces
       * del shell. Y lleva a que se resalte "Panel", que es lo correcto:
       * esta pantalla cuelga de esa sección.
       */
      activePath="/dashboard/perfil"
      title="Tus datos"
      user={{ name: displayName(profile), email: profile.credential.email }}
      headerSlot={roles.map((role) => (
        <Badge key={role} variant={role === 'Admin' ? 'accent' : 'primary'}>
          {role.toUpperCase()}
        </Badge>
      ))}
      footerSlot={<LogoutButton />}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {/* Misma zona: `/` es el panel, Next añade el basePath. */}
          <Link
            href="/"
            className="font-sans text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            ← Volver al panel
          </Link>
          <h2 className="font-display text-3xl text-text-primary">Tus datos</h2>
          <p className="font-serif text-lg italic text-text-secondary">
            Así te verá el resto de tu equipo.
          </p>
        </div>

        <ProfileForm
          email={profile.credential.email}
          initialFirstName={profile.firstName ?? ''}
          initialLastName={profile.lastName ?? ''}
        />
      </div>
    </AppLayout>
  );
}
