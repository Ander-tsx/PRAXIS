import { headers } from 'next/headers';

/**
 * ¿La primera pintura va para un móvil? **Una pista, no la verdad.**
 *
 * Lo estructural del armazón móvil —barra inferior, pantallas apiladas— no se
 * puede decidir solo con CSS sin pintar las dos versiones, y decidirlo al
 * hidratar es pintar el escritorio y saltar a móvil en cada carga: el mismo
 * parpadeo que tuvo la barra plegada (ver `sidebar.ts`). Así que el servidor
 * adivina con lo que trae la petición, y `useEsMovil()` lo corrige en el
 * cliente con el ancho real (D2 de `docs/PLAN-MOVIL.md`).
 *
 * - `Sec-CH-UA-Mobile: ?1` lo manda Chromium sin pedirlo: es la señal limpia.
 * - Si no viene (Safari, Firefox), el `User-Agent`. **El iPad no cuenta**: en
 *   vertical mide 768 o más, que según D1 ya es escritorio.
 *
 * Solo desde Server Components, layouts o Server Actions.
 */
export async function getEsMovilInicial(): Promise<boolean> {
  const cabeceras = await headers();
  const pista = cabeceras.get('sec-ch-ua-mobile');
  if (pista === '?1') return true;
  if (pista === '?0') return false;
  const agente = cabeceras.get('user-agent') ?? '';
  return /iPhone|iPod|Android.+Mobile|Mobile.+Firefox|Windows Phone/i.test(agente);
}
