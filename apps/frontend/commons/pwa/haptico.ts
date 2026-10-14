/**
 * Un toque háptico corto, donde el dispositivo lo permita.
 *
 * - **Android (Chrome)**: `navigator.vibrate`.
 * - **iOS (Safari ≥ 17.4, PWA instalada incluida)**: `navigator.vibrate` **no
 *   existe** y Apple no ofrece otra API. El único camino es un truco: pulsar un
 *   `<input type="checkbox" switch>`, el interruptor nativo de iOS, que al
 *   cambiar de estado da un toque del motor háptico. Ha de ocurrir dentro de un
 *   gesto del usuario (un `click`); fuera de uno, iOS lo ignora sin avisar.
 *   Es un comportamiento no documentado: si una versión futura lo quita, la
 *   función se queda en no-hacer-nada, no falla.
 */
let etiquetaIOS: HTMLLabelElement | null = null;

function etiquetaDeInterruptor(): HTMLLabelElement {
  if (etiquetaIOS?.isConnected) return etiquetaIOS;
  const etiqueta = document.createElement('label');
  etiqueta.setAttribute('aria-hidden', 'true');
  etiqueta.style.cssText =
    'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
  const campo = document.createElement('input');
  campo.type = 'checkbox';
  campo.setAttribute('switch', '');
  campo.tabIndex = -1;
  etiqueta.appendChild(campo);
  document.body.appendChild(etiqueta);
  etiquetaIOS = etiqueta;
  return etiqueta;
}

export function vibrar(ms = 8): void {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
    return;
  }
  try {
    etiquetaDeInterruptor().click();
  } catch {
    /* Sin háptico: no pasa nada. */
  }
}

/** Qué se considera «algo que se pulsa». */
const PULSABLE =
  'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="option"], input[type="checkbox"], input[type="radio"]';

/**
 * Vibra al pulsar cualquier control de la app, **solo instalada y en táctil**
 * (en el navegador normal y en escritorio no hace nada). Un único oyente
 * delegado en `document`: no hay que acordarse de ponerlo en cada botón.
 * Devuelve la función que lo quita.
 */
export function instalarHapticoGlobal(): () => void {
  const instalada =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches;
  if (!instalada || !matchMedia('(hover: none) and (pointer: coarse)').matches) return () => {};

  const alPulsar = (e: MouseEvent) => {
    const destino = e.target;
    if (!(destino instanceof Element)) return;
    const control = destino.closest(PULSABLE);
    if (!control || control.closest('[aria-hidden="true"]')) return;
    if (control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true')
      return;
    vibrar();
  };
  document.addEventListener('click', alPulsar, { capture: true, passive: true });
  return () => document.removeEventListener('click', alPulsar, { capture: true });
}
