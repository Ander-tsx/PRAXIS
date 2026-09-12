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

/**
 * Lo que se puede hacer **a** una organización.
 *
 * ⚠️ **Es otro vocabulario que el de proyecto**, no el mismo a otra escala:
 * `canCreateTask` no significa nada aquí y `canManageBilling` no significa nada
 * dentro de un tablero. Por eso son dos pantallas.
 *
 * 🔴 **Ser dueño no está aquí.** No es un permiso ni un papel: se resuelve
 * comparando con quien paga, y por eso `OrganizationView` trae `soyDueno`
 * aparte. Un dueño los tiene todos y no se le pueden quitar.
 */
export type OrganizationPermission =
  | 'canManageOrganization'
  | 'canCreateProject'
  | 'canViewAllProjects'
  | 'canManageAllProjects'
  | 'canInviteMembers'
  | 'canManageMembers'
  | 'canManageRoleTemplates'
  | 'canManageBilling'
  | 'canViewAuditLog';

/** El diccionario de un papel. Nunca un array. */
export type OrganizationPermissions = Record<OrganizationPermission, boolean>;

/** Un papel de la organización, tal y como lo pinta el portal. */
export interface OrganizationRoleView {
  id: string;
  name: string;
  permissions: OrganizationPermissions;
  isDefault: boolean;
  /** Cuánta gente lo lleva. Para no ofrecer borrar uno que está en uso. */
  miembros: number;
}

/**
 * Una plantilla de rol de proyecto.
 *
 * ⚠️ **Solo afecta a los proyectos nuevos**, y la pantalla tiene que decirlo:
 * cambiar una plantilla no reescribe los roles de los proyectos que ya existen.
 */
export interface ProjectRoleTemplateView {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
}

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

/**
 * Cuántas organizaciones puede tener alguien **a su nombre**. La personal
 * incluida; estar invitado en las de otros no ocupa ninguna.
 *
 * ⚠️ **Es una constante y no una cuota de plan**, y el espejo de
 * `MAX_ORGANIZACIONES_PROPIAS` en `@praxis/contracts`. Lo fue —`organizacionesPropias`,
 * con una escalera por plan que nunca llegó a comprobarse— y se retiró el
 * 2026-08-28: desde que el plan vale solo dentro de la organización que lo paga,
 * uno que además dejara crear más organizaciones sería un beneficio escapándose
 * de la suya. Lo que acota es el farmeo de cuotas **gratuitas**.
 */
export const MAX_ORGANIZACIONES_PROPIAS = 3;

export interface PlanQuotas {
  /** Cuánta gente cabe en la organización. Una invitación sin aceptar ocupa. */
  asientos: Tope;
  /** Proyectos **de la organización**, no de la persona. Los borrados no cuentan. */
  proyectos: Tope;
  /** Mensajes al asistente por persona, **por organización** y por mes natural. */
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

/**
 * Un tope que la organización ya tiene rebasado. Espejo de `QuotaExcedida`.
 *
 * 🔴 **Se llega aquí bajando de plan, no creando de más.** Una organización con
 * 40 proyectos en Negocio que pasa a Equipo —25— queda por encima sin haber
 * hecho nada: el número no subió, bajó el techo. Pasa igual al cancelar, al
 * fallar un cobro y al acabarse el mes gratis.
 *
 * **Y no se le quita nada:** lo que ya hay se abre, se edita y se borra. Lo
 * único que no se puede es añadir uno más. Esta lista existe para poder decirlo
 * antes de que se descubra pulsando un botón que no responde.
 */
export interface QuotaExcedida {
  kind: QuotaKind;
  tope: number;
  actual: number;
}

/** Lo que devuelve `GET /me/billing/resumen`. */
export interface BillingSummary {
  organizationId: string | null;
  tier: PlanTier;
  status: SubscriptionStatus;
  quotas: PlanQuotas;
  uso: {
    proyectos: number;
    iaMensual: number;
    /** Asientos ocupados: miembros activos **más invitaciones vivas**. */
    asientos: number;
    /** Lo que ocupan los adjuntos, en MB. `null` si no se pudo medir. */
    almacenamientoMb: number | null;
  };
  /** Los topes ya rebasados. Vacío casi siempre. Ver `QuotaExcedida`. */
  excedidas: QuotaExcedida[];
  iaReiniciaEn: string;
  pruebaTerminaEn: string | null;
  cancelaEn: string | null;
  cobroDisponible: boolean;
  gestionable: boolean;
  organizaciones: {
    id: string;
    name: string;
    tier: PlanTier;
    soyDueno: boolean;
    myRoleName: string | null;
  }[];
}

export interface OrganizationView {
  id: string;
  kind: 'PERSONAL' | 'ENTERPRISE';
  name: string | null;
  slug: string | null;
  ownerUserId: string;
  tier: PlanTier;
  /** Si eres quien paga. Lo puedes todo, y no se te quita. */
  soyDueno: boolean;
  /** Cómo se llama tu papel. `null` en el dueño, que no lleva ninguno. */
  myRoleName: string | null;
  /** Lo que puedes hacer aquí dentro, ya resuelto por el servidor. */
  myPermissions: OrganizationPermissions;
  seats: number;
  /**
   * Cuánta gente cabe **de verdad**. `null` = sin tope (solo Empresa).
   *
   * ⚠️ **No es `seats`, y la diferencia solo aparece cuando duele.** `seats` es
   * lo contratado en Stripe; esto es el menor entre eso y lo que admite el plan,
   * que es lo que aplica el servidor al invitar. Coinciden siempre salvo después
   * de bajar de plan o cancelar: ahí `seats` conserva el número de la última
   * suscripción, y pintarlo a solas deja la pantalla diciendo «3 de 15» mientras
   * el cuarto invitado recibe un error.
   *
   * Se compara con `cabe()`, nunca con un `<` suelto. Ver `Tope`.
   */
  seatsCap: Tope;
  /** Asientos gastados: miembros activos **más invitaciones vivas**. */
  seatsUsed: number;
  /**
   * Identidad visual, del modal de configuración. `null` = sin elegir, y el
   * selector cae al monograma de letras. `iconKey` es un icono de
   * `lucide-react` de la lista curada; `color`, un `#rrggbb`.
   */
  iconKey: string | null;
  color: string | null;
  createdAt: string;
}

export interface OrganizationMemberView {
  userId: string | null;
  email: string;
  name: string | null;
  /** El papel que lleva. `null` en el dueño, que no lleva ninguno. */
  roleId: string | null;
  roleName: string | null;
  /** Quien paga. Ni se le cambia el papel ni se le saca. */
  isOwner: boolean;
  status: MembershipStatus;
  invitedAt: string;
  joinedAt: string | null;
  /**
   * Dentro, y **en solo lectura** por haber bajado el techo del plan.
   *
   * ⚠️ **No es una tercera opción de `status`, y la diferencia se ve en la
   * pantalla.** Congelado se deriva del orden de antigüedad contra el tope de
   * asientos, así que volver a pagar lo apaga solo. Pintarlo como un estado más
   * al lado de «invitado» diría que a esa persona le pasa algo; lo que pasa es
   * que el plan encogió. Ver `docs/PLAN-ASIENTOS-CONGELADOS.md`.
   */
  frozen: boolean;
  /** Su turno para volver: **1 es el primero**. `null` si no está congelado. */
  queuePosition: number | null;
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

/**
 * Cómo se llama cada permiso en la pantalla de papeles.
 *
 * ⚠️ **Cada frase dice qué abre, no repite el identificador.** «Gestionar
 * proyectos» no le dice a nadie que eso incluye poder entrar en un tablero
 * ajeno; el texto tiene que decirlo, porque es justo lo que sorprende.
 */
export const TEXTO_DE_PERMISO: Record<OrganizationPermission, string> = {
  canManageOrganization: 'Cambiar el nombre y los ajustes de la organización',
  canCreateProject: 'Crear proyectos dentro de la organización',
  canViewAllProjects: 'Ver la lista de todos los proyectos, sin entrar en ellos',
  canManageAllProjects: 'Archivar, suspender y cambiar de responsable cualquier proyecto',
  canInviteMembers: 'Invitar gente, ocupando un asiento por invitación',
  canManageMembers: 'Cambiar papeles y sacar gente',
  canManageRoleTemplates: 'Editar las plantillas con que nacen los proyectos',
  canManageBilling: 'Ver y cambiar el plan, los asientos y las facturas',
  canViewAuditLog: 'Leer el registro de la organización',
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
 * puede hacer nada hasta el día 1 salvo ampliar; y quien se queda sin asientos
 * necesita que alguien salga del equipo. Salidas distintas, y una frase genérica
 * las trata igual.
 *
 * ⚠️ **`miembros_por_proyecto` desapareció el 2026-08-26**: lo sustituyó el
 * asiento, y meter a alguien sin él ya no es un 402 sino un **403 `NOT_IN_ORG`**
 * — no se ha agotado nada, esa persona no está dentro.
 */
export type QuotaKind =
  | 'proyectos'
  | 'ia_mensual'
  | 'asientos'
  | 'organizaciones'
  | 'automatizaciones'
  | 'almacenamiento';

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
  /**
   * Si quien recibe el 402 puede ampliar el plan por su cuenta.
   *
   * Ausente = no se sabe, y entonces se ofrece la salida: esconderle el camino a
   * quien sí puede pagar cuesta más que enseñárselo a quien no.
   */
  puedeAmpliar?: boolean;
}

const QUOTA_KINDS: QuotaKind[] = [
  'proyectos',
  'ia_mensual',
  'asientos',
  'organizaciones',
  'automatizaciones',
  'almacenamiento',
];

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
