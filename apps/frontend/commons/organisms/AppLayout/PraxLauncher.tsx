'use client';

import { PRAX_NAME, PraxAvatar } from '../../atoms/PraxAvatar/PraxAvatar';
import { usePrax } from './PraxContext';

/**
 * El acceso a PRAX, arriba a la derecha de **todas** las cabeceras.
 *
 * Ocupa el hueco que tenían las insignias de rol global y plan, que se
 * retiraron: dos datos que se iban a buscar a Configuración una vez y no se
 * consultaban de reojo. Aquí va lo que sí se usa desde cualquier pantalla.
 *
 * En móvil no hay ventana flotante que valga: lleva a `/assistant`.
 */
export function PraxLauncher() {
  const prax = usePrax();
  if (!prax) return null;

  /* En `/assistant` PRAX **es** la pantalla: un lanzador que abre un minichat
     encima del chat a pantalla completa no tiene sentido. */
  if (prax.zonePath === '/assistant') return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (window.innerWidth < 768) {
          window.location.assign('/assistant');
          return;
        }
        prax.alternar();
      }}
      aria-label={prax.abierto ? `Cerrar ${PRAX_NAME}` : `Abrir ${PRAX_NAME}`}
      aria-pressed={prax.abierto}
      title={PRAX_NAME}
      className={`group flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
        prax.abierto ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      <PraxAvatar mood={prax.abierto ? 'happy' : 'idle'} size="md" animate />
    </button>
  );
}
