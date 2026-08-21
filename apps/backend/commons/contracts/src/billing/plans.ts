/**
 * El catálogo de planes: qué se puede contratar y cuánto da cada cosa.
 *
 * ## Un plan es la tercera capa, y no se parece a las otras dos
 *
 * PRAXIS ya tenía dos capas de autorización, y están explicadas en
 * `docs/backend/permissions.md`:
 *
 * 1. El **rol global** —quién administra la plataforma— que vive en
 *    permissions-service y es privado.
 * 2. El **rol de proyecto** —qué puedes hacer dentro de un tablero— que se
 *    resuelve en `ProjectPermissionGuard` contra `permissions/me`.
 *
 * Un plan es una tercera, y la diferencia importa: las dos primeras contestan
 * **«¿puedes hacer esto?»** y esta contesta **«¿te queda?»**. Un permiso
 * denegado se arregla pidiéndoselo a quien administra el proyecto; una cuota
 * agotada no se arregla con permisos, se arregla pagando o borrando. Son dos
 * conversaciones distintas y por eso el error también lo es: `FORBIDDEN` frente
 * a `QUOTA_EXCEEDED`, con el plan y el tope dentro para poder explicarlo.
 *
 * ⚠️ **Y no se comprueba en la pantalla.** La interfaz apaga botones y avisa
 * antes de gastar el viaje; quien decide es el gateway. Es la misma regla que
 * los permisos y por el mismo motivo: la pantalla es del cliente.
 *
 * ## Los números salen de aquí y de ningún otro sitio
 *
 * Este archivo es la única fuente. El gateway lo lee para negar, la pantalla de
 * planes para pintar la tabla comparativa, y el aviso de «te quedan tres» para
 * saber sobre cuántos. Escribir el mismo número dos veces —una en el guard y
 * otra en la tabla— es garantizar que un día la tabla prometa lo que el guard
 * niega, sin un solo error de compilación.
 */

/**
 * Que un tope no exista.
 *
 * ⚠️ **Sí, es `null`, y sí, choca con la invariante de que `null` significa «no
 * se pudo leer»** (PLAN-REDISENO, invariante 6). La diferencia es de dónde
 * viene: aquella habla de lo que devuelve un `fetch`, donde `null` es la única
 * forma de decir «hubo un error y degradamos». Esto es una **constante del
 * catálogo**, no viaja por la red y no puede fallar al leerse.
 *
 * Las alternativas se miraron y son peores: `Infinity` no sobrevive a `JSON`
 * —sale `null` al otro lado igualmente, pero por accidente y sin decirlo—, y
 * `-1` es un número mágico que alguien acaba sumando. Con `null` y `cabe()`
 * delante, no hay ninguna comparación suelta contra un tope en el repositorio.
 */
export const SIN_TOPE = null;

/** Un tope, o que no lo haya. */
export type Tope = number | null;

/**
 * ¿Cabe uno más?
 *
 * **Siempre por aquí, nunca con un `<` a mano.** Un `actual < tope` con `tope`
 * a `null` compara contra cero: `0 < null` es `false` y `−1 < null` también, así
 * que el plan sin límite se comporta como el plan más restrictivo de todos y no
 * da ningún error. Es el fallo que este helper existe para hacer imposible.
 */
export function cabe(actual: number, tope: Tope): boolean {
  return tope === SIN_TOPE || actual < tope;
}

/** Cuántos quedan, o `null` si no hay tope. Para el aviso, no para decidir. */
export function quedan(actual: number, tope: Tope): Tope {
  return tope === SIN_TOPE ? SIN_TOPE : Math.max(tope - actual, 0);
}

/** Los planes que existen. El orden es el de la tabla de precios. */
export enum PlanTier {
  /** Lo que tienes sin pagar nada. No se contrata: se es. */
  FREE = 'FREE',
  /** El intermedio individual. **Un mes gratis**, y al segundo se cobra. */
  PLUS = 'PLUS',
  /** El individual completo. */
  PRO = 'PRO',
  /** Enterprise pequeño: una organización con asientos. */
  TEAM = 'TEAM',
  /** Enterprise grande: sin topes de inventario. */
  BUSINESS = 'BUSINESS',
}

/**
 * A quién va dirigido un plan.
 *
 * ⚠️ **No es una etiqueta de marketing: decide dónde se paga y quién manda.**
 * Un plan `INDIVIDUAL` lo contrata una persona para su organización personal,
 * que tiene exactamente un miembro y no admite más. Uno `ENTERPRISE` lo
 * contrata una organización con nombre, tiene asientos y tiene quien la
 * administre. Ofrecer «invitar a alguien» sobre el primero sería ofrecer un
 * botón que responde 400.
 */
export enum PlanAudience {
  INDIVIDUAL = 'INDIVIDUAL',
  ENTERPRISE = 'ENTERPRISE',
}

/** Lo que da un plan. Los tres topes que pidió el encargo, y nada más. */
export interface PlanQuotas {
  /**
   * Proyectos **de los que se es dueño**, no en los que se participa.
   *
   * ⚠️ La diferencia es la que hace que el tope sea justo: si contara la
   * pertenencia, alguien podría dejarte sin poder crear proyectos
   * invitándote a los suyos. Se cuenta lo que cada organización sostiene.
   */
  proyectos: Tope;
  /**
   * Mensajes al asistente **por persona y por mes natural**.
   *
   * ⚠️ **Por persona, y no también por organización.** Se consideró un segundo
   * tope agregado y se descartó: un límite de equipo se agota por lo que hizo
   * otro, a media tarde, sin aviso y sin nada que la persona pueda hacer —que
   * es exactamente el «límite que se agota sin explicación» que la trampa 2 del
   * encargo manda evitar—. La organización **ve** el agregado en su portal, que
   * es para lo que sirve saberlo; lo que se niega se niega por lo que tú
   * gastaste. El techo total sigue acotado: es este número por los asientos.
   */
  iaMensualPorPersona: Tope;
  /**
   * Miembros de un proyecto, contando al dueño.
   *
   * El tope lo pone el plan **del dueño del proyecto**, no el de quien invita:
   * es su proyecto el que crece.
   */
  miembrosPorProyecto: Tope;
}

/** Una fila del catálogo. */
export interface PlanSpec {
  tier: PlanTier;
  audience: PlanAudience;
  /** Como se llama en la pantalla. */
  nombre: string;
  /** La frase de una línea de la tabla de precios. */
  resumen: string;
  quotas: PlanQuotas;
  /**
   * Días de prueba antes del primer cobro. `0` si no hay.
   *
   * 🔴 **Solo lo tiene PLUS, y es una decisión del dueño del producto**, no una
   * promoción que se pueda mover: «el plan individual intermedio da un mes
   * gratis; al segundo mes, si no se ha cancelado, llega el cobro». Lo aplica
   * Stripe con `trial_period_days` —no un `setTimeout` nuestro— y queda
   * registrado con su instante en `BillingEvent`, porque «no me avisaron» es la
   * queja más cara de este terreno (trampa 3 del encargo).
   */
  diasDePrueba: number;
  /**
   * La variable de entorno con el precio de Stripe.
   *
   * No el identificador: **los precios cambian entre la cuenta de pruebas y la
   * de producción**, y meterlos en el código obligaría a un despliegue para
   * cambiar una tarifa. `FREE` no tiene ninguna: no se contrata.
   */
  envPrecio: string | null;
  /**
   * Si se cobra por asiento.
   *
   * Los individuales van a tanto alzado —hay una persona— y los Enterprise por
   * asiento: es lo que hace que ampliar el equipo cueste algo y que el tope de
   * IA total esté acotado.
   */
  porAsiento: boolean;
  /** Asientos mínimos al contratar. `0` en los individuales. */
  asientosMinimos: number;
}

/**
 * El catálogo, entero.
 *
 * ## De dónde salen estos números
 *
 * Del encargo, literal: *«cantidades bastante indulgentes pero que a final de
 * cuentas están en las letras pequeñas»*. Están puestos para que **nadie los
 * toque en un uso normal** y para que existan de verdad cuando alguien empuja.
 *
 * ⚠️ **`FREE.iaMensualPorPersona` es 13 y `PRO` es 250 porque ya lo eran.**
 * Salen de `ASSISTANT_LIMITS`, que lleva meses en producción; cambiarlos aquí
 * sería recortarle la cuota a gente que ya la tiene, en un commit que habla de
 * otra cosa. Los planes nuevos se colocan alrededor.
 */
export const PLANS: Record<PlanTier, PlanSpec> = {
  [PlanTier.FREE]: {
    tier: PlanTier.FREE,
    audience: PlanAudience.INDIVIDUAL,
    nombre: 'Gratis',
    resumen: 'Para probar PRAXIS entero con un par de proyectos.',
    quotas: { proyectos: 2, iaMensualPorPersona: 13, miembrosPorProyecto: 5 },
    diasDePrueba: 0,
    envPrecio: null,
    porAsiento: false,
    asientosMinimos: 0,
  },
  [PlanTier.PLUS]: {
    tier: PlanTier.PLUS,
    audience: PlanAudience.INDIVIDUAL,
    nombre: 'Plus',
    resumen: 'El primer mes es gratis. Diez proyectos y PRAX a diario.',
    quotas: { proyectos: 10, iaMensualPorPersona: 100, miembrosPorProyecto: 15 },
    diasDePrueba: 30,
    envPrecio: 'STRIPE_PRICE_PLUS',
    porAsiento: false,
    asientosMinimos: 0,
  },
  [PlanTier.PRO]: {
    tier: PlanTier.PRO,
    audience: PlanAudience.INDIVIDUAL,
    nombre: 'Pro',
    resumen: 'Para quien vive aquí: cuarenta proyectos y PRAX sin pensarlo.',
    quotas: { proyectos: 40, iaMensualPorPersona: 250, miembrosPorProyecto: 50 },
    diasDePrueba: 0,
    /* La variable que ya existe y ya está puesta en el despliegue (`8663b53`).
       Renombrarla a `STRIPE_PRICE_TIER_PRO` habría dejado el entorno de
       producción apuntando a una variable que nadie define, y el síntoma
       —«el cobro no está configurado»— aparece lejos de la causa. */
    envPrecio: 'STRIPE_PRICE_PRO',
    porAsiento: false,
    asientosMinimos: 0,
  },
  [PlanTier.TEAM]: {
    tier: PlanTier.TEAM,
    audience: PlanAudience.ENTERPRISE,
    nombre: 'Equipo',
    resumen: 'Una organización con asientos, y quien la administre.',
    quotas: { proyectos: 100, iaMensualPorPersona: 250, miembrosPorProyecto: 100 },
    diasDePrueba: 0,
    envPrecio: 'STRIPE_PRICE_TEAM',
    porAsiento: true,
    asientosMinimos: 3,
  },
  [PlanTier.BUSINESS]: {
    tier: PlanTier.BUSINESS,
    audience: PlanAudience.ENTERPRISE,
    nombre: 'Empresa',
    resumen: 'Sin topes de inventario. Los asientos son el único número.',
    quotas: {
      proyectos: SIN_TOPE,
      iaMensualPorPersona: 750,
      miembrosPorProyecto: SIN_TOPE,
    },
    diasDePrueba: 0,
    envPrecio: 'STRIPE_PRICE_BUSINESS',
    porAsiento: true,
    asientosMinimos: 10,
  },
};

/** El catálogo como lista, en el orden de la tabla de precios. */
export const PLAN_LIST: PlanSpec[] = [
  PLANS[PlanTier.FREE],
  PLANS[PlanTier.PLUS],
  PLANS[PlanTier.PRO],
  PLANS[PlanTier.TEAM],
  PLANS[PlanTier.BUSINESS],
];

/** Los cinco identificadores, para validar un `@IsIn`. */
export const PLAN_TIERS = Object.values(PlanTier);

/** Los que puede contratar una persona para sí misma. */
export const PLANES_INDIVIDUALES = PLAN_LIST.filter(
  (plan) => plan.audience === PlanAudience.INDIVIDUAL,
);

/** Los que crean una organización con miembros. */
export const PLANES_ENTERPRISE = PLAN_LIST.filter(
  (plan) => plan.audience === PlanAudience.ENTERPRISE,
);

/**
 * El plan de quien no tiene ninguno.
 *
 * **Sin fila en la base = FREE.** No se crea nada al registrarse: una tabla que
 * hay que rellenar para todo el mundo antes de que sirva de algo es una
 * migración pendiente disfrazada, y el valor por defecto ya es el correcto. Es
 * la misma decisión que ya tomó `AssistantSubscription`.
 */
export const PLAN_POR_DEFECTO = PlanTier.FREE;

/** Las cuotas de un plan, con FREE como red por si llega uno que no existe. */
export function quotasDe(tier: PlanTier | string | null | undefined): PlanQuotas {
  const spec = PLANS[tier as PlanTier];
  return (spec ?? PLANS[PLAN_POR_DEFECTO]).quotas;
}

/**
 * Qué se mide.
 *
 * Viaja en el `error.details` de un 402 para que la pantalla sepa **qué**
 * ofrecer: quien se queda sin proyectos ve «amplía el plan o archiva uno», y
 * quien se queda sin IA ve cuándo se le renueva. Un mensaje genérico obliga a
 * leerlo para saber qué hacer.
 */
export enum QuotaKind {
  PROYECTOS = 'proyectos',
  IA_MENSUAL = 'ia_mensual',
  MIEMBROS_POR_PROYECTO = 'miembros_por_proyecto',
}

/**
 * El código de error de una cuota agotada.
 *
 * ⚠️ **402 y no 403**, y la diferencia es la que separa las dos capas: un 403 se
 * arregla pidiendo permiso a una persona, un 402 no se arregla con permisos.
 * Meterlos en el mismo saco haría que la pantalla ofreciera «pídeselo a quien
 * administra el proyecto» a alguien que lo administra él.
 *
 * Es el mismo patrón que `PROJECT_SUSPENDED_CODE`, que existe por lo mismo.
 */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

/** Lo que acompaña a un 402, para poder explicarlo sin adivinar. */
export interface QuotaExceededDetails {
  kind: QuotaKind;
  tier: PlanTier;
  tope: number;
  actual: number;
  /** Solo en `IA_MENSUAL`: cuándo vuelve a cero, en ISO. */
  reiniciaEn?: string;
}

/**
 * El orden de los planes, de menos a más.
 *
 * ⚠️ **Es un orden declarado, no una comparación de cuotas.** Se intentó
 * deducirlo —«mejor es el que da más»— y no sale: `TEAM` da los mismos 250
 * mensajes que `PRO` y más proyectos, así que no hay un orden total, y elegir
 * «el mayor por cada eje» construiría un plan que no se vende. Con un orden
 * escrito, `mejorPlan` devuelve siempre uno del catálogo.
 */
export const PLAN_RANK: Record<PlanTier, number> = {
  [PlanTier.FREE]: 0,
  [PlanTier.PLUS]: 1,
  [PlanTier.PRO]: 2,
  [PlanTier.TEAM]: 3,
  [PlanTier.BUSINESS]: 4,
};

/**
 * El plan que vale para alguien que pertenece a varias organizaciones.
 *
 * **El mejor de todos, y no el de una elegida.** Alguien puede estar en su
 * organización personal (FREE) y a la vez en la de su empresa (BUSINESS): si el
 * plan dependiera de cuál mira en ese momento, la misma acción se permitiría o
 * se negaría según en qué pantalla esté, que es imposible de explicar. Si tu
 * empresa paga BUSINESS, tienes BUSINESS.
 */
export function mejorPlan(tiers: (PlanTier | string | null | undefined)[]): PlanTier {
  let mejor = PLAN_POR_DEFECTO;
  for (const tier of tiers) {
    const candidato = PLANS[tier as PlanTier]?.tier;
    if (candidato && PLAN_RANK[candidato] > PLAN_RANK[mejor]) mejor = candidato;
  }
  return mejor;
}
