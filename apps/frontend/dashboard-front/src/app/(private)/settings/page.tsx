import { SettingsSection } from '@/components/molecules/SettingsSection';
import { ThemeToggle } from '@/components/molecules/ThemeToggle';
import { BillingSummary } from '@/components/organisms/BillingSummary';
import { ProfileForm } from '@/components/organisms/ProfileForm';
import { VoiceLinking } from '@/components/organisms/VoiceLinking';
import type { AssistantQuota, EstadoDeFacturacion } from '@/lib/billing';
import type { VoiceLink } from '@/lib/voice';
import { AppHeader, GlobalRoleBadges } from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';

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
 * `/dashboard/perfil` queda como redirect, solo por los enlaces que ya
 * estuvieran por ahí — y en español a propósito: es la cadena que la gente
 * pudo guardar, no una ruta del producto.
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
  /* Cada `catch` deja su bloque en el estado «no se pudo cargar» en vez de
     tumbar la pantalla entera: que alexa-service esté caído no es motivo para
     no poder cambiar tu nombre. */
  const [{ profile, roles }, theme, quota, voiceLinks, billing] = await Promise.all([
    loadCurrentUser(),
    getTheme(),
    createServerApiClient()
      .get<AssistantQuota>('/me/assistant/quota')
      .catch(() => null),
    createServerApiClient()
      .get<VoiceLink[]>('/alexa/links')
      .catch(() => null),
    /* `null` se trata como apagado en `BillingSummary`: si no se puede
       preguntar si hay pasarela, no se ofrece comprar. */
    createServerApiClient()
      .get<EstadoDeFacturacion>('/me/billing/estado')
      .catch(() => null),
  ]);

  return (
    <AppHeader title="Configuración" headerSlot={<GlobalRoleBadges roles={roles} />}>
      {/* Sin «← Volver al panel»: ahora quien navega es la barra lateral, y un
          enlace de vuelta junto a su propia entrada resaltada sobra.

          El borde entre secciones va aquí y no dentro de `SettingsSection`:
          con una sola sección no había nada que separar, y ahora que hay tres
          la línea marca dónde acaba una y empieza la siguiente sin que
          `SettingsSection` tenga que saber si es la primera. */}
      <div className="flex flex-col gap-10 [&>section:not(:first-child)]:border-t [&>section:not(:first-child)]:border-border [&>section:not(:first-child)]:pt-10">
        <SettingsSection title="Tus datos" description="Así te verá el resto de tu equipo.">
          <ProfileForm
            email={profile.credential.email}
            initialFirstName={profile.firstName ?? ''}
            initialLastName={profile.lastName ?? ''}
          />
        </SettingsSection>

        {/* Va la segunda, justo detrás de tus datos: es lo único de esta
            pantalla que habilita algo que no se puede hacer desde ninguna otra
            parte del producto. Apariencia y Facturación se consultan; esto se
            usa. */}
        <SettingsSection
          title="Praxis Voice"
          description="Vincula tu cuenta con Alexa para consultar tus proyectos hablando."
        >
          <VoiceLinking links={voiceLinks ?? []} sinConexion={voiceLinks === null} />
        </SettingsSection>

        <SettingsSection
          title="Apariencia"
          description="Cómo se ve la interfaz. Se aplica en todas las zonas de PRAXIS."
        >
          <ThemeToggle initialTheme={theme} />
        </SettingsSection>

        <SettingsSection
          title="Facturación"
          description="Tu plan del asistente de IA y cuántos mensajes te quedan este mes."
        >
          <BillingSummary quota={quota} billing={billing} />
        </SettingsSection>
      </div>
    </AppHeader>
  );
}
