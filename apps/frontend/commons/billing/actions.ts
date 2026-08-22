'use server';

import { requireApi } from '../assistant/helpers';
import type { BillingSummary, CatalogoDePlanes, PlanTier } from './planes';

/**
 * Los planes, desde el lado de quien los compra.
 *
 * ## Por qué vive en `commons` y no en una zona
 *
 * La puerta de PRO se abre desde **tres sitios distintos**: la página de
 * planes, la tarjeta de Configuración y el chat del asistente cuando se agota
 * la cuota — y el chat vive en `commons`, así que una acción por zona obligaría
 * a pasarla por props hasta el fondo del componente.
 *
 * ⚠️ **Un solo camino hacia el pago, y es este.** Abrir un checkout es la clase
 * de cosa que se duplica sin darse cuenta —un `fetch` aquí, otro allá— y cada
 * copia es un sitio donde olvidar que el 503 significa «esta instalación no
 * tiene claves» y no «vuelve a intentarlo».
 *
 * ## Lo que estas acciones NO hacen
 *
 * **No conceden ningún plan.** Devuelven la URL a la que mandar el navegador y
 * ahí se acaba su trabajo: quien concede PRO es el webhook de Stripe, con la
 * firma comprobada, y nada más. La vuelta del navegador —`?pago=ok`— la puede
 * escribir cualquiera en la barra de direcciones.
 */

export interface EstadoDeFacturacion {
  /** ¿Esta instalación tiene claves de Stripe? Sin ellas no se ofrece el botón. */
  disponible: boolean;
  /** ¿Ya es cliente? Solo entonces tiene sentido el portal de facturación. */
  gestionable: boolean;
}

/**
 * Qué puede ofrecer la pantalla.
 *
 * Se pregunta en vez de suponerlo: el navegador no puede saber si el backend
 * tiene claves, y enseñar un botón que responde 503 al pulsarlo es peor que no
 * enseñarlo.
 *
 * Si algo falla se responde que **no** hay nada disponible: ante la duda, la
 * pantalla no promete un pago que quizá no se pueda abrir.
 */
export async function estadoDeFacturacionAction(): Promise<EstadoDeFacturacion> {
  const api = await requireApi();
  if (!api) return { disponible: false, gestionable: false };

  return api
    .get<EstadoDeFacturacion>('/me/billing/estado')
    .catch(() => ({ disponible: false, gestionable: false }));
}

/**
 * La cuota de quien pregunta, para saber si el webhook ya llegó.
 *
 * ⚠️ **Existe por el hueco de D2**: al volver del pago el plan todavía puede
 * decir FREE durante unos segundos, porque quien lo concede es el webhook y no
 * la vuelta del navegador. La pantalla de enhorabuena vuelve a preguntar hasta
 * que diga PRO en vez de dar por hecho lo uno o lo otro.
 */
export async function cuotaPropiaAction(): Promise<{ plan: 'FREE' | 'PRO' } | null> {
  const api = await requireApi();
  if (!api) return null;
  return api.get<{ plan: 'FREE' | 'PRO' }>('/me/assistant/quota').catch(() => null);
}

export interface AperturaDePago {
  /** A dónde mandar el navegador. `null` si no se pudo abrir. */
  url: string | null;
  error: string | null;
}

/**
 * Abre el pago del plan PRO y devuelve a dónde ir.
 *
 * Devuelve la URL en vez de redirigir desde el servidor porque quien la usa es
 * un componente de cliente: la pestaña tiene que navegar a Stripe, y un
 * `redirect()` aquí lo seguiría la propia Server Function.
 */
export async function abrirPagoAction(datos: {
  tier: PlanTier;
  /** Solo en los de asiento. En un plan individual el backend responde 400. */
  seats?: number;
  /** Solo en los de empresa: quién paga. En un individual, tampoco vale. */
  organizationId?: string;
}): Promise<AperturaDePago> {
  const api = await requireApi();
  if (!api) return { url: null, error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' };

  try {
    /* ⚠️ **Solo los campos que el DTO declara.** `CheckoutBodyDto` rechaza uno
       de sobra con un 400, así que los opcionales se omiten en vez de mandarse
       en `undefined` — que el envoltorio serializa como ausente, sí, pero
       ponerlo a `null` no. */
    const { url } = await api.post<{ url: string }>('/me/billing/checkout', {
      tier: datos.tier,
      ...(datos.seats !== undefined ? { seats: datos.seats } : {}),
      ...(datos.organizationId ? { organizationId: datos.organizationId } : {}),
    });
    if (!url) return { url: null, error: 'No se pudo abrir la página de pago.' };
    return { url, error: null };
  } catch (error) {
    /* El mensaje del backend cuando lo hay: «El plan Equipo empieza en 3
       asientos» se arregla solo al leerlo, y «inténtalo de nuevo» no. */
    const mensaje = error instanceof Error ? error.message : '';
    return {
      url: null,
      error: mensaje || 'No se pudo abrir la página de pago. Inténtalo de nuevo en un momento.',
    };
  }
}

/**
 * El atajo de PRO, que es de donde viene todo esto.
 *
 * Lo llaman la tarjeta del chat cuando se agota la cuota y el aviso de
 * Configuración: los dos ofrecen **un** plan concreto y no una tabla, así que
 * pedirles el `tier` sería hacerles elegir algo que no eligen.
 */
export async function abrirPagoProAction(): Promise<AperturaDePago> {
  return abrirPagoAction({ tier: 'PRO' });
}

/**
 * El catálogo y lo que este despliegue puede cobrar.
 *
 * Si falla se devuelve `null` y la pantalla lo dice: una tabla de precios vacía
 * parece un producto sin planes, y una con los cinco planes sin botón parece
 * que están agotados.
 */
export async function catalogoDePlanesAction(): Promise<CatalogoDePlanes | null> {
  const api = await requireApi();
  if (!api) return null;
  return api.get<CatalogoDePlanes>('/me/billing/planes').catch(() => null);
}

/**
 * El plan de quien pregunta, con lo gastado dentro.
 *
 * ⚠️ **Esto no decide nada.** Sirve para apagar un botón y para avisar antes de
 * gastar el viaje; quien niega una escritura es el gateway, con las mismas
 * cifras y un 402. Ver `QuotaService`.
 */
export async function resumenDeFacturacionAction(): Promise<BillingSummary | null> {
  const api = await requireApi();
  if (!api) return null;
  return api.get<BillingSummary>('/me/billing/resumen').catch(() => null);
}

/**
 * Abre el portal de Stripe: tarjeta, recibos y baja.
 *
 * Solo tiene sentido para quien ya es cliente — `gestionable` en el estado—, y
 * el backend responde 400 a quien no lo sea.
 */
export async function abrirPortalAction(): Promise<AperturaDePago> {
  const api = await requireApi();
  if (!api) return { url: null, error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' };

  try {
    const { url } = await api.post<{ url: string }>('/me/billing/portal', {});
    if (!url) return { url: null, error: 'No se pudo abrir el portal de facturación.' };
    return { url, error: null };
  } catch {
    return { url: null, error: 'Todavía no tienes ninguna suscripción que gestionar.' };
  }
}
