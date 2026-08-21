import { setThemeAction } from '@/app/(private)/settings/actions';
import { PanelCard } from '@/components/molecules/PanelCard';
import { BillingSummary } from '@/components/organisms/BillingSummary';
import { VoiceLinking } from '@/components/organisms/VoiceLinking';
import type { AssistantQuota, EstadoDeFacturacion } from '@/lib/billing';
import type { VoiceLink } from '@/lib/voice';
import { AppHeader, ThemeToggle } from '@praxis/commons';
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
 * estado, cerrar sesión, eliminar la cuenta— a la pantalla de cuenta
 * (`/dashboard/profile`), a la que se llega pulsando tu propia ficha en la
 * barra lateral. Aquí quedan los ajustes que se consultan: Alexa, apariencia y
 * facturación. La línea que las separa es «quién eres» contra «cómo funciona
 * esto».
 *
 * ## Por qué ya no es una pila de secciones
 *
 * Era la misma pila que la pantalla de cuenta —título, frase en cursiva, regla
 * horizontal— y aquí se veía todavía peor: **«Apariencia» ocupaba una banda de
 * 1400 px de ancho para un interruptor de 72**, y «Praxis Voice» dejaba media
 * pantalla en blanco a la derecha de una lista de tres pasos. Lo que se veía al
 * entrar era la separación entre bloques, no los bloques.
 *
 * Ahora son **tres tarjetas repartidas por lo que mide cada una**:
 *
 * | Bloque | Sitio | Por qué |
 * |---|---|---|
 * | Praxis Voice | fila 1, 7 de 12 | Es lo más alto —pasos, generador y dispositivos— y lo único de esta pantalla que **habilita** algo que no se puede hacer desde ninguna otra parte |
 * | Facturación | fila 1, 5 de 12 | Con los dos planes apilados mide casi lo mismo que Voice, así que la fila queda pareja sin huecos |
 * | Apariencia | fila 2, banda de una fila | Un interruptor no da para una tarjeta alta: título a la izquierda, control a la derecha, y se acabó |
 *
 * La banda de Apariencia no lleva cuerpo: el control entra por `aside` de
 * `PanelCard`, que es justo para esto. Rellenarla con algo para que abultara
 * habría sido cambiar un hueco por relleno.
 *
 * En móvil la rejilla cae a una columna y la banda apila su control bajo el
 * título.
 */
export default async function SettingsPage() {
  /* Cada `catch` deja su bloque en el estado «no se pudo cargar» en vez de
     tumbar la pantalla entera: que alexa-service esté caído no es motivo para
     no poder cambiar el tema. */
  const [, theme, quota, voiceLinks, billing] = await Promise.all([
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

  /* Sin `headerSlot`: el rol —y ahora también el plan— los pone el armazón en
     todas las pantallas de todas las zonas (`cuentaSlot`). Dejarlo aquí los
     pintaba dos veces. */
  return (
    <AppHeader title="Configuración">
      {/* Sin «← Volver al panel»: quien navega es la barra lateral, y un enlace
          de vuelta junto a su propia entrada resaltada sobra. */}
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <PanelCard
            title="Praxis Voice"
            description="Vincula tu cuenta con Alexa para consultar tus proyectos hablando."
            icon={<IconoVoz />}
            className="lg:col-span-7"
          >
            <VoiceLinking links={voiceLinks ?? []} sinConexion={voiceLinks === null} />
          </PanelCard>

          <PanelCard
            title="Facturación"
            description="Tu plan del asistente de IA y cuántos mensajes te quedan este mes."
            icon={<IconoFacturacion />}
            className="lg:col-span-5"
          >
            <BillingSummary quota={quota} billing={billing} />
          </PanelCard>
        </div>

        {/* El tema, en una banda: el control vive en el encabezado, a la
            derecha, y la tarjeta no tiene cuerpo. */}
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

function IconoFacturacion() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path strokeLinecap="round" d="M3 10h18M6.5 14.5h3" />
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
      <circle cx="12" cy="12" r="8.5" />
      {/* La mitad rellena: el mismo gesto de «claro y oscuro» que el sol y la
          luna del propio interruptor, sin repetir sus dos iconos. */}
      <path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor" stroke="none" />
    </svg>
  );
}
