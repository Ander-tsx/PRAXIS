import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PlanTier } from './plans';
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
  };
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
  organizaciones: { id: string; name: string; tier: PlanTier; myRole: string }[];
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
   */
  @ApiProperty({ enum: [PlanTier.PLUS, PlanTier.PRO, PlanTier.TEAM, PlanTier.BUSINESS] })
  @IsIn([PlanTier.PLUS, PlanTier.PRO, PlanTier.TEAM, PlanTier.BUSINESS])
  tier: PlanTier;

  /** Solo en los de asiento. En los individuales sobra y da 400. */
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
