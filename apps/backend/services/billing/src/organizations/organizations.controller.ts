import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OrganizationPermission, type PlanTier, type SubscriptionStatus } from '@praxis/contracts';
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
  planDe(@Payload() dto: { userId: string; organizationId?: string | null }) {
    return this.organizaciones.planEfectivoDe(dto.userId, dto.organizationId);
  }

  /**
   * Cuántas organizaciones hay ya a nombre de alguien.
   *
   * ⚠️ **Cuenta por `ownerUserId`, no por membresía.** Estar invitado en la de
   * otro no ocupa ninguna de las tuyas: si contara, quien colabora con tres
   * clientes se quedaría sin poder tener la suya.
   */
  @MessagePattern({ cmd: 'billing_orgs_owned_count' })
  organizacionesPropias(@Payload() dto: { userId: string }) {
    return this.organizaciones.contarPropias(dto.userId);
  }

  /**
   * La personal, creándola si hace falta.
   *
   * ⚠️ El nombre y el correo los pasa el gateway: aquí no se sabe cómo se llama
   * nadie, y este servicio no habla con ningún otro a propósito.
   */
  @MessagePattern({ cmd: 'billing_personal_org' })
  personal(@Payload() dto: { userId: string; name?: string; email?: string }) {
    return this.organizaciones.personalDe(dto.userId, { name: dto.name, email: dto.email });
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
  renombrar(
    @Payload()
    dto: {
      organizationId: string;
      userId: string;
      name: string;
      iconKey?: string | null;
      color?: string | null;
    },
  ) {
    return this.organizaciones.renombrar(
      dto.organizationId,
      dto.userId,
      dto.name,
      dto.iconKey,
      dto.color,
    );
  }

  @MessagePattern({ cmd: 'billing_org_set_image' })
  ponerImagen(
    @Payload() dto: { organizationId: string; userId: string; mimeType: string; base64: string },
  ) {
    return this.organizaciones.ponerImagen(
      dto.organizationId,
      dto.userId,
      dto.mimeType,
      new Uint8Array(Buffer.from(dto.base64, 'base64')),
    );
  }

  @MessagePattern({ cmd: 'billing_org_delete_image' })
  quitarImagen(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.quitarImagen(dto.organizationId, dto.userId);
  }

  @MessagePattern({ cmd: 'billing_org_get_image' })
  async leerImagen(@Payload() dto: { organizationId: string; userId: string }) {
    const imagen = await this.organizaciones.leerImagen(dto.organizationId, dto.userId);
    if (!imagen || 'error' in imagen) return imagen;
    return {
      mimeType: imagen.mimeType,
      size: imagen.size,
      base64: Buffer.from(imagen.bytes).toString('base64'),
    };
  }

  @MessagePattern({ cmd: 'billing_org_members' })
  miembros(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.miembros(dto.organizationId, dto.userId);
  }

  /** Devuelve el token en claro **una sola vez**: el gateway lo mete en el correo. */
  @MessagePattern({ cmd: 'billing_org_invite' })
  invitar(
    @Payload()
    dto: { organizationId: string; porUserId: string; email: string; roleId?: string },
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
    dto: { organizationId: string; porUserId: string; userId: string; roleId: string },
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

  /** Cambiar asientos exige `canManageBilling`: es lo que cuesta dinero. */
  @MessagePattern({ cmd: 'billing_org_seats' })
  async asientos(@Payload() dto: { organizationId: string; userId: string; seats: number }) {
    const permiso = await this.organizaciones.exigirPermiso(
      dto.organizationId,
      dto.userId,
      OrganizationPermission.CAN_MANAGE_BILLING,
    );
    if ('codigo' in permiso) return permiso;
    return this.suscripciones.cambiarAsientos(dto.organizationId, dto.seats);
  }

  /**
   * El registro de facturación.
   *
   * ⚠️ Antes lo veía cualquier `ADMIN`; ahora exige `canViewAuditLog`. Son dos
   * cosas distintas y por eso se separaron: llevar el equipo no tiene por qué
   * incluir leer cuánto y cuándo ha pagado la empresa.
   */
  @MessagePattern({ cmd: 'billing_org_history' })
  async historial(@Payload() dto: { organizationId: string; userId: string; limite?: number }) {
    const permiso = await this.organizaciones.exigirPermiso(
      dto.organizationId,
      dto.userId,
      OrganizationPermission.CAN_VIEW_AUDIT_LOG,
    );
    if ('codigo' in permiso) return permiso;
    return this.suscripciones.historial(dto.organizationId, dto.limite);
  }

  /** Todas, para el panel de plataforma. El rol global lo comprueba el gateway. */
  @MessagePattern({ cmd: 'billing_org_all' })
  todas(@Payload() dto: { page?: number; limit?: number; search?: string }) {
    return this.organizaciones.todas(dto);
  }

  /* ─── Papeles ──────────────────────────────────────────────────────────── */

  @MessagePattern({ cmd: 'billing_org_roles' })
  papeles(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.papeles(dto.organizationId, dto.userId);
  }

  @MessagePattern({ cmd: 'billing_org_role_create' })
  crearPapel(
    @Payload()
    dto: { organizationId: string; porUserId: string; name: string; permissions: unknown },
  ) {
    return this.organizaciones.crearPapel(dto);
  }

  @MessagePattern({ cmd: 'billing_org_role_update' })
  editarPapel(
    @Payload()
    dto: {
      organizationId: string;
      porUserId: string;
      roleId: string;
      name: string;
      permissions: unknown;
    },
  ) {
    return this.organizaciones.editarPapel(dto);
  }

  @MessagePattern({ cmd: 'billing_org_role_delete' })
  borrarPapel(@Payload() dto: { organizationId: string; porUserId: string; roleId: string }) {
    return this.organizaciones.borrarPapel(dto);
  }

  /* ─── Plantillas de rol de proyecto ────────────────────────────────────── */

  @MessagePattern({ cmd: 'billing_org_templates' })
  plantillas(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.plantillas(dto.organizationId, dto.userId);
  }

  @MessagePattern({ cmd: 'billing_org_template_save' })
  guardarPlantilla(
    @Payload()
    dto: {
      organizationId: string;
      porUserId: string;
      templateId?: string;
      name: string;
      permissions: Record<string, unknown>;
    },
  ) {
    return this.organizaciones.guardarPlantilla(dto);
  }

  @MessagePattern({ cmd: 'billing_org_template_delete' })
  borrarPlantilla(
    @Payload() dto: { organizationId: string; porUserId: string; templateId: string },
  ) {
    return this.organizaciones.borrarPlantilla(dto);
  }

  /* ─── Pertenencia y traspaso ───────────────────────────────────────────── */

  /**
   * ¿Tiene asiento aquí?
   *
   * Es lo que va a preguntar el gateway antes de meter a alguien en un proyecto
   * de esta organización, cuando exista `Project.organizationId` (O3).
   */
  /**
   * Quién está congelado en una organización, y en qué puesto de la cola.
   *
   * ⚠️ **No exige permiso, igual que `billing_org_members`.** Lo pregunta el
   * gateway en cada escritura para saber si quien escribe puede; pedir un
   * permiso aquí obligaría al guard a tener uno para poder comprobar si tiene
   * alguno, que es la pescadilla de siempre. El filtro de quién ve la lista
   * entera lo pone el gateway, en `GET /me/billing/resumen`.
   */
  @MessagePattern({ cmd: 'billing_frozen_members' })
  congelados(@Payload() dto: { organizationId: string }) {
    return this.organizaciones.congeladosDe(dto.organizationId);
  }

  /**
   * ¿Está **esta** persona congelada **aquí**?
   *
   * El atajo del camino caliente: `exigirAsientoVivo` solo necesita un booleano
   * y el puesto, y devolver la lista entera por cada escritura sería mandar por
   * TCP los correos de todo el equipo para contestar que sí o que no.
   */
  @MessagePattern({ cmd: 'billing_seat_frozen' })
  congelado(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.estaCongelado(dto.organizationId, dto.userId);
  }

  @MessagePattern({ cmd: 'billing_org_is_member' })
  esMiembro(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.esMiembroDe(dto.organizationId, dto.userId);
  }

  /** Los permisos de alguien dentro de una organización, ya resueltos. */
  @MessagePattern({ cmd: 'billing_org_permissions' })
  permisos(@Payload() dto: { organizationId: string; userId: string }) {
    return this.organizaciones.permisosDe(dto.organizationId, dto.userId);
  }

  /** Da asiento directamente. Ver `darAsiento`: no es una invitación. */
  @MessagePattern({ cmd: 'billing_org_seat_grant' })
  darAsiento(
    @Payload()
    dto: { organizationId: string; porUserId: string; userId: string; email?: string },
  ) {
    return this.organizaciones.darAsiento(dto);
  }

  /**
   * Apunta algo en el registro de una organización.
   *
   * ⚠️ **Sin comprobar permisos, y a propósito.** Lo llama el gateway después de
   * haber hecho la acción, con la comprobación ya pasada: pedirla otra vez aquí
   * sería una llamada más para repetir lo que ya se decidió, y un registro que
   * puede negarse a escribir no es un registro.
   */
  @MessagePattern({ cmd: 'billing_org_log' })
  apuntar(@Payload() dto: { organizationId: string; type: string; payload?: unknown }) {
    return this.organizaciones.apuntar(dto);
  }

  @MessagePattern({ cmd: 'billing_org_transfer' })
  traspasar(@Payload() dto: { organizationId: string; porUserId: string; userId: string }) {
    return this.organizaciones.traspasar(dto);
  }
}
