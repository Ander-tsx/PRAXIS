import { setThemeAction } from '@/app/(private)/settings/actions';
import { PanelCard } from '@/components/molecules/PanelCard';
import { VoiceLinking } from '@/components/organisms/VoiceLinking';
import type { VoiceLink } from '@/lib/voice';
import { AppHeader, ThemeToggle } from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Praxis Voice',
};

/**
 * Praxis Voice y la apariencia: **cómo se comporta la aplicación**.
 *
 * ## De dónde sale esta pantalla
 *
 * Era «Configuración», una pila de tres tarjetas que no tenían nada que ver
 * entre sí: la voz, el plan y el tema. El plan encima salía **dos veces** —un
 * resumen aquí y la tabla de precios en otra entrada del menú—, y quien quería
 * cambiar de plan tenía que adivinar cuál de las dos era la buena. La
 * facturación se fue entera a su propia página y Configuración pasó a ser un
 * desplegable con las dos que quedan.
 *
 * ⚠️ **La apariencia vive aquí y no en una página propia**, y es una decisión
 * de quien lo usa: un interruptor no da para una pantalla. La alternativa era
 * dejarlo huérfano en una Configuración sin cuerpo, o sea una entrada de menú
 * entera para una sola casilla.
 *
 * ⚠️ **«Tus datos» no está aquí.** Se fue con el resto de lo tuyo —foto,
 * estado, cerrar sesión, eliminar la cuenta— a `/dashboard/profile`, a la que
 * se llega pulsando tu propia ficha en la barra lateral. La línea que las
 * separa es «quién eres» contra «cómo funciona esto».
 */
export default async function VoicePage() {
  /* Cada `catch` deja su bloque en «no se pudo cargar» en vez de tumbar la
     pantalla: que alexa-service esté caído no es motivo para no poder cambiar
     el tema. */
  const [, theme, voiceLinks] = await Promise.all([
    loadCurrentUser(),
    getTheme(),
    createServerApiClient()
      .get<VoiceLink[]>('/alexa/links')
      .catch(() => null),
  ]);

  return (
    <AppHeader title="Praxis Voice">
      <div className="flex flex-col gap-4">
        <PanelCard
          title="Praxis Voice"
          description="Vincula tu cuenta con Alexa para consultar tus proyectos hablando."
          icon={<IconoVoz />}
        >
          <VoiceLinking links={voiceLinks ?? []} sinConexion={voiceLinks === null} />
        </PanelCard>

        {/* El tema, en una banda: el control vive en el encabezado, a la
            derecha, y la tarjeta no tiene cuerpo. Rellenarla con algo para que
            abultara habría sido cambiar un hueco por relleno. */}
        <PanelCard
          title="Apariencia"
          description="Elige el tema que quieres para la apariencia de toda la interfaz de Praxis"
          icon={<IconoApariencia />}
          aside={<ThemeToggle initialTheme={theme} onCambiar={setThemeAction} />}
        />
      </div>
    </AppHeader>
  );
}

/* Los iconos de las tarjetas, a 18 px y con el mismo trazo que los de la barra
   lateral. Van aquí y no en un átomo nuevo porque los usa solo esta pantalla. */

function IconoVoz() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5a2.5 2.5 0 012.5 2.5v5a2.5 2.5 0 11-5 0V7A2.5 2.5 0 0112 4.5zM6 11.5a6 6 0 0012 0M12 17.5V20"
      />
    </svg>
  );
}

function IconoApariencia() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.25" />
      <path
        strokeLinecap="round"
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
      />
    </svg>
  );
}
