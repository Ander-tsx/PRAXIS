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

export type PlanTier = 'FREE' | 'TEAM' | 'BUSINESS' | 'ENTERPRISE';

/**
 * Cómo se contrata un plan.
 *
 * ⚠️ **`FREE` y `ENTERPRISE` no tienen precio, y por razones opuestas**: al
 * primero no se le puede pagar, al segundo hay que escribirle. Deducirlo de un
 * `envPrecio` vacío deja a la pantalla enseñando el botón equivocado sin dar
 * ningún error, así que el motivo viaja explícito.
 */
export type PlanContratacion = 'NINGUNA' | 'AUTOSERVICIO' | 'CONTACTO';

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
  /** Cuánta gente cabe en la organización. Una invitación sin aceptar ocupa. */
  asientos: Tope;
  /** Proyectos **de la organización**, no de la persona. Los borrados no cuentan. */
  proyectos: Tope;
  /** Organizaciones de las que se es dueño. Estar invitado en otras no cuenta. */
  organizacionesPropias: Tope;
  iaMensualPorPersona: Tope;
  automatizacionesPorProyecto: Tope;
  /** Lo que suman los adjuntos de la organización, en megabytes. */
  almacenamientoOrgMb: Tope;
  /** Hasta dónde llega hacia atrás el historial de Análisis, en días. */
  historialAnalisisDias: Tope;
}

export interface PlanSpec {
  tier: PlanTier;
  nombre: string;
  resumen: string;
  /** A quién va dirigido, en una línea. Para la cabecera de su columna. */
  paraQuien: string;
  quotas: PlanQuotas;
  contratacion: PlanContratacion;
  diasDePrueba: number;
  envPrecio: string | null;
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

/* ─── Cuotas agotadas ──────────────────────────────────────────────────────
 *
 * El 402. Es lo que llega cuando una escritura no cabe en el plan, y lo que
 * permite ofrecer una salida en vez de un callejón.
 */

/**
 * Qué tope se agotó. Espejo de `QuotaKind` en `@praxis/contracts`.
 *
 * ⚠️ **No es decoración del mensaje: decide qué se ofrece.** Quien se queda sin
 * proyectos puede borrar uno y seguir; quien se queda sin mensajes de IA no
 * puede hacer nada hasta el día 1 salvo ampliar; y quien se queda sin sitio en
 * un tablero depende de que lo saque otro. Tres salidas distintas, y una frase
 * genérica las trata igual.
 */
export type QuotaKind = 'proyectos' | 'ia_mensual' | 'miembros_por_proyecto';

/** El código del sobre. Espejo de `QUOTA_EXCEEDED_CODE` en `@praxis/contracts`. */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

/** Lo que acompaña a un 402. Espejo de `QuotaExceededDetails`. */
export interface QuotaExceededDetails {
  kind: QuotaKind;
  tier: PlanTier;
  tope: number;
  actual: number;
  /** Solo en `ia_mensual`: cuándo vuelve a cero, en ISO. */
  reiniciaEn?: string;
}

const QUOTA_KINDS: QuotaKind[] = ['proyectos', 'ia_mensual', 'miembros_por_proyecto'];

/**
 * ¿Este error es una cuota agotada? Y si lo es, ¿cuál?
 *
 * Recibe `unknown` y no un `ApiError` a propósito: lo llaman Server Actions
 * dentro de un `catch`, donde lo que hay es `unknown` de verdad, y obligar a
 * cada una a hacer el `instanceof` antes acabaría con la mitad mirando solo el
 * `message`.
 *
 * ⚠️ **Se comprueba la forma, no solo el código.** El `details` cruza la red y
 * un 402 sin detalle —de una versión vieja del gateway, o de un intermediario
 * que se comió el cuerpo— devolvería un objeto con `undefined` dentro, que la
 * pantalla pintaría como «0 de 0». Sin forma válida esto devuelve `null` y quien
 * llama se queda con el mensaje del servidor, que siempre es correcto.
 */
export function detallesDeCuota(error: unknown): QuotaExceededDetails | null {
  if (!error || typeof error !== 'object') return null;

  const { code, details } = error as { code?: unknown; details?: unknown };
  if (code !== QUOTA_EXCEEDED_CODE) return null;
  if (!details || typeof details !== 'object') return null;

  const detalle = details as Partial<QuotaExceededDetails>;
  if (!QUOTA_KINDS.includes(detalle.kind as QuotaKind)) return null;
  if (typeof detalle.tope !== 'number' || typeof detalle.actual !== 'number') return null;

  return detalle as QuotaExceededDetails;
}
