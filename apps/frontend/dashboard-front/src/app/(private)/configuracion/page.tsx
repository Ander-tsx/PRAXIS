import { AppHeader, Badge } from '@praxis/commons';
import { loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { SettingsSection } from '@/components/molecules/SettingsSection';
import { ProfileForm } from '@/components/organisms/ProfileForm';

export const metadata: Metadata = {
  title: 'Configuración',
};

/**
 * Configuración de la cuenta.
 *
 * **Era `/dashboard/perfil`, y se movió aquí en vez de convivir con ella.** Una
 * entrada nueva en la barra lateral que llevara a una pantalla cuyo único
 * contenido fuese un enlace a «Tus datos» es un salto de más; y dejar las dos
 * rutas con el mismo formulario serían dos sitios donde editar lo mismo.
 * `/perfil` queda como redirect, solo por los enlaces que ya estuvieran por ahí.
 *
 * Está montada como una **pila de secciones** desde el primer día, con una sola
 * dentro. Es donde van los ajustes que vengan después, y esa es la razón de que
 * la sección sea un componente y no maquetación suelta.
 *
 * ⚠️ **El correo no se edita, y no es un olvido:** vive en `Credential`, en otro
 * microservicio, y no hay ningún endpoint que lo cambie. El formulario lo enseña
 * desactivado, para que al menos quede claro de qué cuenta hablamos.
 */
export default async function SettingsPage() {
  const { profile, roles } = await loadCurrentUser();

  return (
    <AppHeader
      title="Configuración"
      headerSlot={roles.map((role) => (
        <Badge key={role} variant={role === 'Admin' ? 'accent' : 'primary'}>
          {role.toUpperCase()}
        </Badge>
      ))}
    >
      {/* Sin «← Volver al panel»: ahora quien navega es la barra lateral, y un
          enlace de vuelta junto a su propia entrada resaltada sobra. */}
      <div className="flex flex-col gap-10">
        <SettingsSection title="Tus datos" description="Así te verá el resto de tu equipo.">
          <ProfileForm
            email={profile.credential.email}
            initialFirstName={profile.firstName ?? ''}
            initialLastName={profile.lastName ?? ''}
          />
        </SettingsSection>
      </div>
    </AppHeader>
  );
}
