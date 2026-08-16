import { setThemeAction } from '@/app/(private)/settings/actions';
import { SettingsSection } from '@/components/molecules/SettingsSection';
import { BillingSummary } from '@/components/organisms/BillingSummary';
import { VoiceLinking } from '@/components/organisms/VoiceLinking';
import type { AssistantQuota, EstadoDeFacturacion } from '@/lib/billing';
import type { VoiceLink } from '@/lib/voice';
import { AppHeader, GlobalRoleBadges, ThemeToggle } from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Configuración',
};

/**
 * Configuración: **cómo se comporta la aplicación**, no quién eres.
 *
 * ⚠️ **«Tus datos» ya no está aquí.** Se fue con el resto de lo tuyo —foto,
 * estado, cerrar sesión, eliminar la cuenta— a la pantalla de cuenta, a la que
 * se llega pulsando tu propia ficha en la barra lateral. Aquí quedan los
 * ajustes que se consultan: Alexa, apariencia y facturación. La línea que las
 * separa es «quién eres» contra «cómo funciona esto».
 *
 * Está montada como una **pila de secciones**, que es donde van los ajustes que
 * vengan después: por eso la sección es un componente y no maquetación suelta.
 */
export default async function SettingsPage() {
  /* Cada `catch` deja su bloque en el estado «no se pudo cargar» en vez de
     tumbar la pantalla entera: que alexa-service esté caído no es motivo para
     no poder cambiar tu nombre. */
  const [{ roles }, theme, quota, voiceLinks, billing] = await Promise.all([
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
        {/* Va la primera: es lo único de esta pantalla que habilita algo que no
            se puede hacer desde ninguna otra parte del producto. Apariencia y
            Facturación se consultan; esto se usa. */}
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
          <ThemeToggle initialTheme={theme} onCambiar={setThemeAction} />
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
