/**
 * Las formas del catálogo de planes, del lado del navegador.
 *
 * ## Por qué se declaran aquí y no se importan de `@praxis/contracts`
 *
 * Porque ese paquete es de backend: arrastra `class-validator` y los
 * decoradores de Swagger, y meterlos en un bundle de cliente es cargar un
 * validador entero para leer un tipo. Es la misma decisión que ya tomó
 * `dashboard-front/src/lib/billing.ts` con la cuota del asistente.
 *
 * ⚠️ **Y son solo formas: aquí no hay ni una cifra.** Los topes, los nombres y
 * los resúmenes de cada plan llegan de `GET /me/billing/planes`, que los lee de
 * `PLANS` en contracts. Copiarlos a mano sería garantizar que un día la tabla de
 * precios prometa lo que el servidor niega, sin un solo error de compilación.
 */

export type PlanTier = 'FREE' | 'PLUS' | 'PRO' | 'TEAM' | 'BUSINESS';

export type PlanAudience = 'INDIVIDUAL' | 'ENTERPRISE';

export type SubscriptionStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type MembershipStatus = 'INVITED' | 'ACTIVE';

/**
 * Un tope, o que no lo haya.
 *
 * ⚠️ `null` es **sin límite**, no «no se pudo leer». Choca con la invariante de
 * los fetch de esta casa y por eso está dicho: viene de una constante del
 * catálogo, no de una respuesta que pueda fallar. Se lee siempre con `cabe()` o
 * con `textoDeTope()`, nunca con un `<` suelto — `3 < null` es `false`, así que
 * comparar a mano convierte el plan sin límite en el más restrictivo.
 */
export type Tope = number | null;

export interface PlanQuotas {
  proyectos: Tope;
  iaMensualPorPersona: Tope;
  miembrosPorProyecto: Tope;
}

export interface PlanSpec {
  tier: PlanTier;
  audience: PlanAudience;
  nombre: string;
  resumen: string;
  quotas: PlanQuotas;
  diasDePrueba: number;
  envPrecio: string | null;
  porAsiento: boolean;
  asientosMinimos: number;
}

/** Lo que devuelve `GET /me/billing/planes`. */
export interface CatalogoDePlanes {
  planes: PlanSpec[];
  /** Los que **este** despliegue puede cobrar. FREE siempre está. */
  disponibles: PlanTier[];
}

/** Lo que devuelve `GET /me/billing/resumen`. */
export interface BillingSummary {
  organizationId: string | null;
  tier: PlanTier;
  status: SubscriptionStatus;
  quotas: PlanQuotas;
  uso: { proyectos: number; iaMensual: number };
  iaReiniciaEn: string;
  pruebaTerminaEn: string | null;
  cancelaEn: string | null;
  cobroDisponible: boolean;
  gestionable: boolean;
  organizaciones: { id: string; name: string; tier: PlanTier; myRole: string }[];
}

export interface OrganizationView {
  id: string;
  kind: 'PERSONAL' | 'ENTERPRISE';
  name: string | null;
  slug: string | null;
  ownerUserId: string;
  tier: PlanTier;
  myRole: OrganizationRole;
  seats: number;
  /** Asientos gastados: miembros activos **más invitaciones vivas**. */
  seatsUsed: number;
  createdAt: string;
}

export interface OrganizationMemberView {
  userId: string | null;
  email: string;
  name: string | null;
  role: OrganizationRole;
  status: MembershipStatus;
  invitedAt: string;
  joinedAt: string | null;
}

/** Una línea del registro de facturación de una organización. */
export interface BillingEventView {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

/** ¿Cabe uno más? Nunca con un `<` a mano: ver `Tope`. */
export function cabe(actual: number, tope: Tope): boolean {
  return tope === null || actual < tope;
}

/** Un tope, escrito. `null` es «sin límite», no un hueco. */
export function textoDeTope(tope: Tope): string {
  return tope === null ? 'Sin límite' : String(tope);
}

/**
 * Qué se dice de un estado de suscripción.
 *
 * ⚠️ **`PAST_DUE` no dice que se haya perdido nada**, porque no se ha perdido:
 * el acceso sigue mientras Stripe reintenta. Decir «plan suspendido» sobre una
 * tarjeta caducada manda a alguien a soporte por algo que se arregla solo.
 */
export const TEXTO_DE_ESTADO: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Al día',
  TRIALING: 'Mes gratis',
  PAST_DUE: 'Pago pendiente',
  CANCELED: 'Sin plan',
};

export const TEXTO_DE_PAPEL: Record<OrganizationRole, string> = {
  OWNER: 'Dueño',
  ADMIN: 'Administra',
  MEMBER: 'Miembro',
};

/** Una fecha ISO, escrita como la escribe el resto de la aplicación. */
export function fechaCorta(iso: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fecha);
}
