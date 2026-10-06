'use client';

/**
 * La parte de la página de la lectura sin conexión (M7 de
 * `docs/PLAN-MOVIL.md`). El otro lado es `src/service-worker/sw.js` de `web`.
 *
 * El SW guarda las pantallas visitadas **por persona**, y no puede saber quién
 * es: la sesión va en una cookie httpOnly. Se lo dice la app al montar el
 * armazón, con una huella (SHA-256 del correo) y no el correo: el nombre de
 * una caché no tiene por qué llevar datos personales.
 */

async function huellaDe(email: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const resumen = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function avisarAlServiceWorker(mensaje: Record<string, unknown>): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registro = await navigator.serviceWorker.getRegistration();
  const destino = navigator.serviceWorker.controller ?? registro?.active ?? null;
  destino?.postMessage(mensaje);
}

/**
 * Quién está dentro. Si es otra persona que la de las copias guardadas, el SW
 * borra las de la anterior antes de guardar ninguna nueva (I2).
 */
export async function presentarPersona(email: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const huella = await huellaDe(email);
  if (!huella) return;
  /* `ready` y no el registro de ahora: en la primera visita el SW aún se está
     instalando, y un aviso a nadie se perdería. Sin SW (desarrollo) no se
     resuelve nunca, y no pasa nada. */
  const registro = await navigator.serviceWorker.ready;
  registro.active?.postMessage({ tipo: 'persona', huella });
}

/**
 * Borra todas las copias sin conexión: se llama al cerrar sesión (D5). Se
 * borran desde aquí **y** se le pide al SW, por si no hay ninguno controlando
 * la página: `caches` es la misma en los dos lados.
 */
export async function olvidarDatosSinConexion(): Promise<void> {
  await avisarAlServiceWorker({ tipo: 'olvidar-datos' });
  if (typeof caches === 'undefined') return;
  for (const nombre of await caches.keys()) {
    if (nombre.startsWith('praxis-datos-') || nombre === 'praxis-sesion') {
      await caches.delete(nombre);
    }
  }
}
