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

/*
 * 🕳️ Aquí estaba `cuotaPropiaAction`, que preguntaba `/me/assistant/quota` para
 * ver si el webhook ya había concedido el plan tras volver del pago.
 *
 * Se apoyaba en el campo `plan` de esa respuesta, que era del catálogo **por
 * persona** y se ha retirado. Y no la llamaba nadie: quien resuelve ese hueco
 * hoy es `PaymentReturn`, contra `GET /me/billing/resumen`, que es donde vive el
 * plan de la organización — el único que concede algo.
 */

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

/* 🕳️ Aquí estaba `abrirPagoProAction`, el atajo que abría el pago de PRO en un
   clic desde la tarjeta del chat y el aviso de Configuración. Se retiró el
   2026-08-26 con el plan PRO, y **no tiene sustituto de un solo clic a
   propósito**: desde que todo plan se contrata para una organización, el
   checkout necesita saber cuál, y eso es una elección de quien paga. Los dos
   sitios que lo usaban llevan ahora a la tabla de precios, que sí sabe
   preguntarlo. */

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
 *
 * ⚠️ **Con `organizationId` o sin él NO da lo mismo.** El plan vale dentro de la
 * organización que lo paga (trampa #20 de CLAUDE.md): `/me/billing/resumen` sin
 * organización devuelve **FREE**, no «el mejor que tengas». La pantalla de
 * vuelta del pago sondea con el id de la organización que acaba de comprar; sin
 * él, nunca detectaría que el plan cambió.
 */
export async function resumenDeFacturacionAction(
  organizationId?: string | null,
): Promise<BillingSummary | null> {
  const api = await requireApi();
  if (!api) return null;
  const ruta = organizationId
    ? `/me/billing/resumen?organizationId=${encodeURIComponent(organizationId)}`
    : '/me/billing/resumen';
  return api.get<BillingSummary>(ruta).catch(() => null);
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
