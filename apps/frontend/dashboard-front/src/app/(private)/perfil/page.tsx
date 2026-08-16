import { SettingsSection } from '@/components/molecules/SettingsSection';
import { AccountIdentity } from '@/components/organisms/AccountIdentity';
import { DeleteAccount } from '@/components/organisms/DeleteAccount';
import { ProfileForm } from '@/components/organisms/ProfileForm';
import { AppHeader, GlobalRoleBadges, LogoutButton, hrefDeAvatar } from '@praxis/commons';
import { loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tu cuenta',
};

/**
 * Tu cuenta: quién eres y qué se ve de ti.
 *
 * ## Por qué existe, y por qué se llega pulsando tu propia cara
 *
 * Lo tuyo estaba repartido en tres sitios: el nombre en Configuración —entre la
 * facturación y el tema—, «Cerrar sesión» en el pie de la barra lateral, y
 * eliminar la cuenta en ninguno. Pulsar tu avatar es el gesto que ya se intenta
 * en cualquier otra herramienta, así que ahí es donde está ahora todo:
 * identidad, sesión y el final del camino.
 *
 * En Configuración se quedan los **ajustes**: apariencia, facturación y Alexa.
 * La diferencia que separa una pantalla de la otra es «quién eres» contra «cómo
 * se comporta la aplicación».
 *
 * ⚠️ **La ruta ya existía como redirección** a `/settings`, de cuando esta
 * pantalla se fusionó con aquella. Ahora vuelve a ser una pantalla de verdad, y
 * eso es exactamente lo que esperaba quien tuviera el enlace guardado: aquí
 * está su nombre, como estaba.
 */
export default async function CuentaPage() {
  const { profile, roles } = await loadCurrentUser();

  const nombre = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return (
    <AppHeader title="Tu cuenta" headerSlot={<GlobalRoleBadges roles={roles} />}>
      <div className="flex flex-col gap-10 [&>section:not(:first-child)]:border-t [&>section:not(:first-child)]:border-border [&>section:not(:first-child)]:pt-10">
        <SettingsSection
          title="Cómo te ven"
          description="Tu foto y tu estado salen junto a cada mensaje que escribes."
        >
          <AccountIdentity
            nombre={nombre}
            email={profile.credential.email}
            /* La foto se sirve por el proxy de **esta** zona: `avatarUrl` viene
               relativa al gateway justo para no atarla a ninguna. */
            avatarSrc={hrefDeAvatar(profile.avatarUrl, '/dashboard/api/gateway')}
            presenciaInicial={profile.presence ?? 'AVAILABLE'}
          />
        </SettingsSection>

        <SettingsSection title="Tus datos" description="Así te verá el resto de tu equipo.">
          <ProfileForm
            email={profile.credential.email}
            initialFirstName={profile.firstName ?? ''}
            initialLastName={profile.lastName ?? ''}
          />
        </SettingsSection>

        <SettingsSection
          title="Sesión"
          description="Cierra la sesión en este navegador. Podrás volver a entrar cuando quieras."
        >
          {/* El mismo botón que estaba en la barra lateral, y por eso vive en
              `commons`: lo único que cambia es dónde se pinta. */}
          <div className="w-fit">
            <LogoutButton />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Eliminar la cuenta"
          description="Lo último y lo único que no se deshace."
        >
          <DeleteAccount email={profile.credential.email} />
        </SettingsSection>
      </div>
    </AppHeader>
  );
}
