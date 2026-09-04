'use client';

import { usePathname } from 'next/navigation';
import { PRAX_NAME, PraxAvatar } from '../../atoms/PraxAvatar/PraxAvatar';
import { usePrax } from './PraxContext';

/**
 * El acceso a PRAX, **flotando abajo a la derecha** de todas las pantallas.
 *
 * ## Por qué ya no está en una cabecera
 *
 * Porque no hay cabecera. Era una barra de `h-16` con el título de la pantalla
 * —«Proyectos», «Mensajes directos»— que repetía lo que ya dicen la barra
 * lateral y la propia página, y se llevaba cuatro rem de alto en todas.
 * Retirada, PRAX necesitaba un sitio propio.
 *
 * Abajo a la derecha es donde se busca un asistente y donde no tapa nada que se
 * lea: el contenido crece desde arriba. `fixed` y no `absolute` porque tiene que
 * quedarse quieto mientras `<main>` se desplaza.
 *
 * ⚠️ **Redondo y con fondo propio, no un icono suelto.** Antes vivía sobre la
 * cabecera, que tenía su franja; ahora flota sobre contenido cualquiera —una
 * tabla, un tablero— y sin superficie debajo no se distingue de lo que haya.
 *
 * En móvil no hay ventana flotante que valga: lleva a `/assistant`.
 */
export function PraxLauncher() {
  const prax = usePrax();
  const pathname = usePathname();
  if (!prax) return null;

  /**
   * En `/assistant` PRAX **es** la pantalla: un lanzador que abre un minichat
   * encima del chat a pantalla completa no tiene sentido.
   *
   * 🔴 **Se mira la ruta, no `zonePath`.** Era `prax.zonePath === '/assistant'`,
   * y eso dejó de valer en F2 de la fusión: un segmento de la app fusionada
   * pasa `zonePath=""` —no tiene `basePath` que compensar— así que la
   * comparación daba `false` y el lanzador aparecía **encima de la propia
   * pantalla de PRAX**. `usePathname()` acierta en los dos mundos: en la zona
   * sin fusionar devuelve `/` y `zonePath` completa el prefijo; ya fusionada
   * devuelve `/assistant` entero.
   */
  if (`${prax.zonePath}${pathname === '/' ? '' : pathname}`.startsWith('/assistant')) return null;

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
      className={`group fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 shadow-lg transition-colors ${
        prax.abierto ? 'bg-white/15' : 'bg-[#202020] hover:bg-white/10'
      }`}
    >
      <PraxAvatar mood={prax.abierto ? 'happy' : 'idle'} size="md" animate />
    </button>
  );
}
