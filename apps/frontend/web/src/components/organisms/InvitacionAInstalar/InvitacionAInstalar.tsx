'use client';

import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useEffect, useState } from 'react';

const DESCARTADA_KEY = 'praxis:instalar:descartada';

function leerDescartada(): boolean {
  try {
    return window.localStorage.getItem(DESCARTADA_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * La invitación a instalar Praxis como app, **solo en móvil** (M1 de
 * `docs/PLAN-MOVIL.md`).
 *
 * Dos caminos, porque los dos sistemas no se parecen:
 *
 * - **Android (Chromium):** el navegador ofrece `beforeinstallprompt`, que ya
 *   captura `useInstallPrompt`; «Instalar» abre el diálogo del sistema.
 * - **iOS:** no existe ese evento ni ninguna forma de instalar desde la página.
 *   Lo único posible es decir los dos toques: Compartir y «Añadir a pantalla
 *   de inicio».
 *
 * Sale una vez y no vuelve si se descarta (`localStorage`: es una preferencia
 * de este navegador, no de la cuenta). Dentro de la app instalada no sale
 * nunca. Espera unos segundos antes de aparecer: nadie quiere que lo primero
 * que vea al entrar sea un anuncio.
 */
export function InvitacionAInstalar() {
  const { puedeInstalar, instalar } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [esIOS, setEsIOS] = useState(false);

  useEffect(() => {
    const instalada =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const movil = window.matchMedia('(max-width: 767px)').matches;
    if (instalada || !movil || leerDescartada()) return;
    const ios = /iPhone|iPod/.test(navigator.userAgent);
    const t = window.setTimeout(() => {
      setEsIOS(ios);
      setVisible(true);
    }, 4000);
    return () => window.clearTimeout(t);
  }, []);

  function descartar() {
    setVisible(false);
    try {
      window.localStorage.setItem(DESCARTADA_KEY, '1');
    } catch {
      /* Sin almacenamiento volverá a salir en otra visita; nada más. */
    }
  }

  /* En Android solo tiene sentido si el navegador ofrece instalar; en iOS,
     siempre que no esté instalada. */
  if (!visible || (!esIOS && !puedeInstalar)) return null;

  return (
    <section
      aria-label="Instalar Praxis"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-[250] flex items-start gap-3 rounded-2xl border border-white/10 bg-surface-3 p-4 shadow-2xl md:hidden"
    >
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-sans text-sm font-semibold text-text-primary">Instala Praxis</p>
        {esIOS ? (
          <p className="font-sans text-xs leading-relaxed text-text-secondary">
            Pulsa <span className="font-semibold text-text-primary">Compartir</span> y luego{' '}
            <span className="font-semibold text-text-primary">Añadir a pantalla de inicio</span>. Se
            abrirá como una app, a pantalla completa.
          </p>
        ) : (
          <p className="font-sans text-xs leading-relaxed text-text-secondary">
            Ábrela desde tu pantalla de inicio, a pantalla completa y más rápida.
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          {!esIOS && (
            <button
              type="button"
              onClick={async () => {
                await instalar();
                setVisible(false);
              }}
              className="min-h-11 cursor-pointer rounded-lg bg-white px-4 font-sans text-sm font-semibold text-black"
            >
              Instalar
            </button>
          )}
          <button
            type="button"
            onClick={descartar}
            className="min-h-11 cursor-pointer rounded-lg px-3 font-sans text-sm text-text-secondary"
          >
            {esIOS ? 'Entendido' : 'Ahora no'}
          </button>
        </div>
      </div>
    </section>
  );
}
