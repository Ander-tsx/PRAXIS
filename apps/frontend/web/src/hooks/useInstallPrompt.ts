import { useEffect, useState } from 'react';

/**
 * `beforeinstallprompt`, tipado a mano: el DOM de TypeScript no lo declara
 * (no es un estándar cerrado, solo lo implementan Chromium y derivados).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * El botón de instalar de la landing, y cuándo tiene sentido enseñarlo.
 *
 * ## Por qué no se puede pintar siempre
 *
 * Instalar una PWA no es una acción que el sitio pueda ofrecer por su cuenta:
 * es el navegador quien decide si la app es instalable y quien dispara
 * `beforeinstallprompt` — y solo Chromium lo hace (Chrome, Edge, Opera,
 * Brave). Safari e iOS no emiten el evento nunca, y un botón que no hace nada
 * al pulsarlo es peor que no tener botón. `puedeInstalar` distingue "el
 * navegador puede instalar y aún no lo ha hecho" de "aquí no hay nada que
 * ofrecer".
 *
 * ## Y por qué tampoco si ya está instalada
 *
 * Con la PWA ya añadida, el propio Chrome deja de emitir el evento en la
 * pestaña del navegador — pero quien la abre *dentro* de la app instalada
 * (`display-mode: standalone`) no debería ver un botón para instalar lo que
 * ya está corriendo. Las dos comprobaciones —`matchMedia` al montar y
 * `appinstalled` en caliente— cubren cada entrada a esa situación.
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  /* Inicializador perezoso, no un `setState` dentro del efecto: es el mismo
     dato -si ya se está corriendo como app instalada- pero leído una vez al
     montar, sin disparar una renderización en cascada para algo que no
     cambia entre el primer render y el efecto. */
  const [instalada, setInstalada] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  );

  useEffect(() => {
    const alDisponible = (event: Event) => {
      /* Sin esto Chrome pinta su propia mini-infobar además del botón de la
         página: dos invitaciones a la misma acción, una de ellas fuera de
         nuestro control visual. */
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const alInstalar = () => {
      setInstalada(true);
      setPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', alDisponible);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alDisponible);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  const instalar = async () => {
    if (!prompt) return;
    await prompt.prompt();
    /* Aceptada o no, el evento capturado ya no sirve — Chrome no lo repite
       hasta la próxima carga de página. Sea cual sea `outcome`, tocaba
       esconder el botón y no dejarlo apuntando a una promesa gastada. */
    await prompt.userChoice;
    setPrompt(null);
  };

  return { puedeInstalar: prompt !== null && !instalada, instalar };
}
