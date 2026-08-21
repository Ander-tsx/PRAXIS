import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { OrganizationRole, PlanTier, SubscriptionStatus } from '@praxis/contracts';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { OrganizationsService } from './organizations.service';

/**
 * Los comandos de billing-service.
 *
 * ⚠️ **Ninguno comprueba quién es quien pregunta más allá del `userId` que le
 * llega.** El gateway ya validó el token; aquí el `userId` se trata como un
 * hecho, igual que en el resto de servicios internos. Lo que sí se comprueba —y
 * es distinto— es el **papel dentro de la organización**, porque eso solo lo
 * sabe este servicio: el gateway no tiene la tabla de miembros.
 */
@Controller()
export class OrganizationsController {
  constructor(
    private readonly organizaciones: OrganizationsService,
    private readonly suscripciones: SubscriptionsService,
  ) {}

  /**
   * El plan que vale para alguien. **Es el comando más llamado del servicio**:
   * lo pide el gateway antes de cada escritura con cuota.
   */
  @MessagePattern({ cmd: 'billing_plan_of' })
  planDe(@Payload() dto: { userId: string }) {
    return this.organizaciones.planEfectivoDe(dto.userId);
  }

  @MessagePattern({ cmd: 'billing_personal_org' })
  personal(@Payload() dto: { userId: string }) {
    return this.organizaciones.personalDe(dto.userId);
  }

  @MessagePattern({ cmd: 'billing_orgs_of' })
  mias(@Payload() dto: { userId: string }) {
    return this.organizaciones.organizacionesDe(dto.userId);
  }

  @MessagePattern({ cmd: 'billing_org_one' })
  una(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.una(dto.organizationId, dto.userId);
  }

  @MessagePattern({ cmd: 'billing_org_create' })
  crear(
    @Payload()
    dto: { ownerUserId: string; ownerEmail: string; name: string; tier: PlanTier; seats: number },
  ) {
    return this.organizaciones.crear(dto);
  }

  @MessagePattern({ cmd: 'billing_org_rename' })
  renombrar(@Payload() dto: { organizationId: string; userId: string; name: string }) {
    return this.organizaciones.renombrar(dto.organizationId, dto.userId, dto.name);
  }

  @MessagePattern({ cmd: 'billing_org_members' })
  miembros(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.miembros(dto.organizationId, dto.userId);
  }

  /** Devuelve el token en claro **una sola vez**: el gateway lo mete en el correo. */
  @MessagePattern({ cmd: 'billing_org_invite' })
  invitar(
    @Payload()
    dto: { organizationId: string; porUserId: string; email: string; role?: OrganizationRole },
  ) {
    return this.organizaciones.invitar(dto);
  }

  @MessagePattern({ cmd: 'billing_org_accept' })
  aceptar(@Payload() dto: { token: string; userId: string; email: string }) {
    return this.organizaciones.aceptar(dto);
  }

  @MessagePattern({ cmd: 'billing_org_member_role' })
  cambiarRol(
    @Payload()
    dto: { organizationId: string; porUserId: string; userId: string; role: OrganizationRole },
  ) {
    return this.organizaciones.cambiarRol(dto);
  }

  @MessagePattern({ cmd: 'billing_org_member_remove' })
  quitar(
    @Payload()
    dto: { organizationId: string; porUserId: string; userId?: string; email?: string },
  ) {
    return this.organizaciones.quitar(dto);
  }

  /* ─── Suscripción ──────────────────────────────────────────────────────── */

  /**
   * Lo aplica el webhook de Stripe, y **solo** el webhook.
   *
   * ⚠️ No lleva `userId` a propósito: no es una acción de nadie. Si algún día
   * este comando aceptara una sesión, la vuelta del navegador podría concederse
   * el plan a sí misma, que es el error clásico de esta integración.
   */
  @MessagePattern({ cmd: 'billing_apply_plan' })
  aplicar(
    @Payload()
    dto: {
      organizationId: string;
      tier: PlanTier;
      status: SubscriptionStatus;
      seats?: number;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      stripePriceId?: string | null;
      trialEndsAt?: string | null;
      currentPeriodEnd?: string | null;
      cancelAt?: string | null;
      stripeEventId?: string | null;
    },
  ) {
    return this.suscripciones.aplicar(dto);
  }

  @MessagePattern({ cmd: 'billing_by_stripe_subscription' })
  porSuscripcion(@Payload() dto: { stripeSubscriptionId: string }) {
    return this.suscripciones.porSuscripcionDeStripe(dto.stripeSubscriptionId);
  }

  @MessagePattern({ cmd: 'billing_customer_of' })
  cliente(@Payload() dto: { userId: string }) {
    return this.suscripciones.clienteDe(dto.userId);
  }

  @MessagePattern({ cmd: 'billing_subscription_of' })
  suscripcion(@Payload() dto: { organizationId: string }) {
    return this.suscripciones.deOrganizacion(dto.organizationId);
  }

  /** Cambiar asientos exige ser dueño: es lo que cuesta dinero. */
  @MessagePattern({ cmd: 'billing_org_seats' })
  async asientos(@Payload() dto: { organizationId: string; userId: string; seats: number }) {
    const permiso = await this.organizaciones.exigir(dto.organizationId, dto.userId, [
      'OWNER' as OrganizationRole,
    ]);
    if ('codigo' in permiso) return permiso;
    return this.suscripciones.cambiarAsientos(dto.organizationId, dto.seats);
  }

  @MessagePattern({ cmd: 'billing_org_history' })
  async historial(@Payload() dto: { organizationId: string; userId: string; limite?: number }) {
    const permiso = await this.organizaciones.exigir(dto.organizationId, dto.userId, [
      'OWNER' as OrganizationRole,
      'ADMIN' as OrganizationRole,
    ]);
    if ('codigo' in permiso) return permiso;
    return this.suscripciones.historial(dto.organizationId, dto.limite);
  }
}
