import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PLANES_AUTOSERVICIO, PlanTier } from './plans';
import type { PlanQuotas, QuotaKind, Tope } from './plans';

/**
 * En qué estado está una suscripción, con nuestros nombres.
 *
 * ⚠️ **No son los de Stripe, y la traducción es a propósito.** Stripe tiene
 * ocho —`incomplete`, `incomplete_expired`, `unpaid`, `paused`…— y la mitad son
 * matices de su motor de cobro que no cambian nada de lo que hace esta
 * aplicación. Lo que aquí hay que decidir es una sola cosa: **si el plan vale
 * hoy**. `ACTIVE` y `TRIALING` valen; el resto no.
 *
 * Guardar los ocho habría metido su vocabulario en nuestras consultas y en
 * nuestras pantallas, y el día que Stripe añada el noveno tendríamos un estado
 * que no sabemos leer gobernando el acceso.
 */
export enum SubscriptionStatus {
  /** Pagada y al día. */
  ACTIVE = 'ACTIVE',
  /** Dentro del mes gratis. Vale igual que `ACTIVE`. */
  TRIALING = 'TRIALING',
  /**
   * El cobro falló y Stripe está reintentando.
   *
   * ⚠️ **No se corta el acceso**, y es una decisión: una tarjeta caducada es lo
   * más común del mundo y quitarle los proyectos a alguien por eso es la peor
   * forma de enterarse. Se avisa en la interfaz y se deja trabajar mientras
   * Stripe reintenta; cuando se rinde manda `deleted` y ahí sí se cae a FREE.
   */
  PAST_DUE = 'PAST_DUE',
  /** Se acabó. El plan efectivo vuelve a ser FREE. */
  CANCELED = 'CANCELED',
}

/** Los estados en los que el plan cuenta. */
export const ESTADOS_VIGENTES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
];

/** ¿Vale hoy el plan de esta suscripción? */
export function estaVigente(status: SubscriptionStatus | string | null | undefined): boolean {
  return ESTADOS_VIGENTES.includes(status as SubscriptionStatus);
}

/**
 * Lo que necesita saber cualquier pantalla sobre el plan de quien la mira.
 *
 * Es lo que devuelve `GET /me/billing/resumen` y lo que consumen todos los
 * sitios que apagan un botón. **Trae los topes y lo gastado juntos**: enseñar
 * «has llegado al límite» sin decir cuál es el límite obliga a ir a buscarlo, y
 * enseñar el límite sin lo gastado no deja saber si queda.
 */
/**
 * Un tope que la organización ya tiene rebasado.
 *
 * ## Se puede estar por encima sin haber hecho nada mal
 *
 * 🔴 **Es la trampa 4 del encargo, y el caso es bajar de plan.** Una
 * organización con 40 proyectos en BUSINESS que pasa a TEAM —25— queda por
 * encima sin haber creado nada: el número no subió, bajó el techo. Pasa igual al
 * cancelar, al fallar un cobro y al acabarse el mes gratis.
 *
 * **Lo que ocurre entonces es nada**, y está decidido así en D5 de
 * `docs/PLAN-CUOTAS.md`: no se borra, no se archiva y no se congela lo que ya
 * hay. Los 40 proyectos se abren, se editan y se borran; lo único que no se
 * puede es crear el 41, exactamente igual que si se hubiera llegado al tope por
 * arriba.
 *
 * ⚠️ **Lo que sí hace falta es decirlo.** Sin esto, quien administra descubre su
 * situación pulsando un botón que no responde, y un tope rebasado se lee como
 * una avería en vez de como la consecuencia de un cambio de plan que hizo él.
 * Nada de esto decide nada: quien niega sigue siendo `QuotaService`.
 */
export interface QuotaExcedida {
  kind: QuotaKind;
  /** El tope del plan actual. Nunca `null` — sin tope no se puede exceder. */
  tope: number;
  /** Lo que hay, en las mismas unidades que `tope`. */
  actual: number;
}

export interface BillingSummary {
  /**
   * De qué organización sale el plan que vale.
   *
   * ⚠️ **`null` cuando no hay ninguna suscripción**, que es el caso de casi
   * todo el mundo: la organización personal se crea la primera vez que hace
   * falta guardar algo, no al registrarse, y pintar esta pantalla no es hacer
   * falta. Sin fila el plan ya es FREE — crearla aquí convertiría cada carga en
   * una escritura para todas las cuentas del sistema.
   */
  organizationId: string | null;
  tier: PlanTier;
  status: SubscriptionStatus;
  quotas: PlanQuotas;
  /** Lo gastado ahora mismo, en las mismas unidades que `quotas`. */
  uso: {
    proyectos: number;
    iaMensual: number;
    /** Asientos ocupados: miembros activos **más invitaciones vivas**. */
    asientos: number;
    /**
     * Lo que ocupan los adjuntos, en MB.
     *
     * `null` si no se pudo medir. Es la única cifra del resumen que puede
     * faltar: sumarla cuesta dos viajes TCP y no vale la pena tumbar la pantalla
     * de facturación entera porque uno de los dos no conteste.
     */
    almacenamientoMb: number | null;
  };
  /**
   * Los topes que esta organización ya tiene rebasados. Vacío casi siempre.
   *
   * Ver `QuotaExcedida`: se llega aquí bajando de plan, no creando de más.
   */
  excedidas: QuotaExcedida[];
  /** Cuándo vuelve a cero el contador de IA, en ISO. */
  iaReiniciaEn: string;
  /**
   * Si estás dentro del mes gratis, cuándo acaba.
   *
   * 🔴 **Esto es lo que hace demostrable la trampa 3 del encargo.** El mes
   * gratis se cobra al segundo y «no me avisaron» es la queja más cara de este
   * terreno: la fecha viaja a la pantalla desde el día uno, sale en el resumen
   * y sale en el aviso de los últimos días.
   */
  pruebaTerminaEn: string | null;
  /** Si ya se pidió la baja, cuándo deja de valer. */
  cancelaEn: string | null;
  /** Si el cobro está configurado en este entorno. Sin esto no hay botón. */
  cobroDisponible: boolean;
  /** Si hay cliente en Stripe, y por tanto portal de facturación que abrir. */
  gestionable: boolean;
  /** Enterprise: las organizaciones a las que perteneces. Vacío si ninguna. */
  organizaciones: {
    id: string;
    name: string;
    tier: PlanTier;
    /** Si eres quien paga. Lo puedes todo dentro, y no se te quita. */
    soyDueno: boolean;
    /** Cómo se llama tu papel. `null` en el dueño, que no lleva ninguno. */
    myRoleName: string | null;
  }[];
}

/** Lo que devuelve una comprobación de cuota. */
export interface QuotaCheck {
  permitido: boolean;
  kind: QuotaKind;
  tier: PlanTier;
  tope: Tope;
  actual: number;
}

export class CheckoutBodyDto {
  /**
   * Qué se contrata.
   *
   * ⚠️ **`FREE` no está**: no se contrata, se es. Pedirlo tendría que
   * significar «dame de baja», y dar de baja desde el mismo endpoint que cobra
   * es la clase de ambigüedad que acaba en una baja accidental.
   *
   * ⚠️ **`ENTERPRISE` tampoco**, y por el motivo contrario: se paga, pero no
   * tiene precio en Stripe porque se negocia. Aceptarlo aquí abriría un checkout
   * contra un precio que no existe, y el fallo saldría al pulsar. La lista sale
   * de `PLANES_AUTOSERVICIO`, que es justo la que sabe distinguir los dos casos.
   */
  @ApiProperty({ enum: PLANES_AUTOSERVICIO.map((plan) => plan.tier) })
  @IsIn(PLANES_AUTOSERVICIO.map((plan) => plan.tier))
  tier: PlanTier;

  /** Cuántos asientos se contratan. Todos los planes de pago van por asiento. */
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  seats?: number;

  /**
   * Para qué organización.
   *
   * Ausente en un plan individual: es la personal de quien trae el token, y
   * dejar elegirla sería poder pagarle el plan a otro —o peor, cambiárselo—.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
