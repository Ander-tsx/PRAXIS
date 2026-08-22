import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type BillingSummary,
  CheckoutBodyDto,
  type OrganizationView,
  PLANS,
  PLAN_LIST,
  PlanAudience,
  PlanTier,
  type SubscriptionStatus,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { oFalla } from './fallos';
import { QuotaService } from './quota.service';
import { StripeService } from './stripe.service';

/** Lo que devuelve assistant-service al preguntarle por la cuota de alguien. */
interface CuotaDeIa {
  usados: number;
  limite: number;
  reinicia: string;
}

/**
 * El plan, desde el lado de quien paga.
 *
 * Cuelga de `/me` y **nunca acepta un `userId`**: quien paga es siempre quien
 * trae el token. Un parámetro aquí sería poder abrir un pago —o el portal de
 * facturación, con sus recibos dentro— a nombre de otra persona.
 *
 * ⚠️ **La organización sí se puede nombrar, y es distinto.** Un plan de empresa
 * lo paga la organización, no la persona, así que el checkout acepta un
 * `organizationId` — y por eso se comprueba que quien lo manda sea su dueño
 * antes de abrir nada. Sin esa comprobación, cualquiera podría cambiarle el
 * plan a la empresa de otro.
 */
@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/billing')
export class BillingController {
  constructor(
    private readonly stripe: StripeService,
    private readonly quota: QuotaService,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    @Inject('ASSISTANT_SERVICE') private readonly assistantClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  /**
   * El catálogo, y cuáles se pueden contratar **en este despliegue**.
   *
   * ⚠️ Las dos cosas juntas y no solo la segunda: la tabla de precios enseña
   * los cinco planes —comparar es para lo que existe— pero solo los que tienen
   * precio configurado llevan botón. Enseñar únicamente los disponibles haría
   * que un despliegue a medias pareciera un producto más pequeño.
   */
  @Get('planes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'El catálogo de planes y cuáles se pueden contratar aquí' })
  planes() {
    return { planes: PLAN_LIST, disponibles: this.stripe.planesDisponibles() };
  }

  /**
   * Todo lo que necesita una pantalla para hablar del plan de quien la mira.
   *
   * **Los topes y lo gastado, juntos y en una sola llamada.** Enseñar «has
   * llegado al límite» sin decir cuál es el límite obliga a ir a buscarlo, y el
   * límite sin lo gastado no deja saber si queda; pedirlos por separado son tres
   * viajes y tres estados de carga para pintar una barra.
   *
   * ⚠️ **Nada de esto decide nada.** Quien niega una escritura es
   * `QuotaService`, en el servidor y con las mismas cifras. Esto es para poder
   * avisar antes, que es distinto de impedir.
   */
  @Get('resumen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plan, topes, consumo y organizaciones de quien pregunta' })
  async resumen(@Request() req: Express.Request): Promise<BillingSummary> {
    const userId = req.user!.userId;
    const plan = await this.quota.planDe(userId);

    const [proyectos, ia, organizaciones, cliente] = await Promise.all([
      this.proyectosPropios(userId),
      this.cuotaDeIa(userId, plan.quotas.iaMensualPorPersona),
      this.organizaciones(userId),
      this.cliente(userId),
    ]);

    return {
      organizationId: plan.organizationId,
      tier: plan.tier,
      status: plan.status,
      quotas: plan.quotas,
      uso: { proyectos, iaMensual: ia.usados },
      iaReiniciaEn: ia.reinicia,
      pruebaTerminaEn: plan.trialEndsAt,
      cancelaEn: plan.cancelAt,
      cobroDisponible: this.stripe.enabled,
      gestionable: Boolean(cliente.stripeCustomerId),
      organizaciones: organizaciones.map((organizacion) => ({
        id: organizacion.id,
        name: organizacion.name ?? '',
        tier: organizacion.tier,
        myRole: organizacion.myRole,
      })),
    };
  }

  /**
   * Qué puede ofrecer la pantalla de Configuración.
   *
   * Existe desde antes que `resumen` y se queda: la tarjeta de Configuración y
   * el aviso del chat solo necesitan estos dos booleanos, y pedir el resumen
   * entero para pintar un botón son cuatro llamadas a microservicios por cada
   * carga de una pantalla que ni siquiera habla de facturación.
   */
  @Get('estado')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Si el cobro está disponible y si ya eres cliente' })
  @ApiResponse({ status: 200, description: '{ disponible, gestionable }' })
  async estado(@Request() req: Express.Request) {
    if (!this.stripe.enabled) return { disponible: false, gestionable: false };

    const { stripeCustomerId } = await this.cliente(req.user!.userId);
    return { disponible: true, gestionable: Boolean(stripeCustomerId) };
  }

  /**
   * Abre el pago de un plan y devuelve a dónde ir.
   *
   * Devuelve la URL en vez de redirigir: quien llama es un `fetch` desde el
   * navegador a través del proxy de la zona, y un 303 ahí lo seguiría el propio
   * `fetch` en vez de la pestaña.
   *
   * ⚠️ **Aquí no se concede nada.** Esto abre una página de Stripe; quien
   * aplica el plan es el webhook, con la firma comprobada.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abre una página de pago de Stripe para un plan' })
  @ApiResponse({ status: 200, description: '{ url } a la que mandar el navegador' })
  @ApiResponse({ status: 400, description: 'El plan y la organización no casan' })
  @ApiResponse({ status: 403, description: 'La organización no es tuya' })
  async checkout(@Request() req: Express.Request, @Body() body: CheckoutBodyDto) {
    const userId = req.user!.userId;
    const spec = PLANS[body.tier];
    const deEmpresa = spec.audience === PlanAudience.ENTERPRISE;

    if (deEmpresa && !body.organizationId) {
      throw new BadRequestException(
        `El plan ${spec.nombre} se contrata para una organización: créala antes de pagar.`,
      );
    }
    if (!deEmpresa && body.organizationId) {
      /* ⚠️ No se ignora en silencio. Un plan individual va siempre a la
         organización personal de quien paga; aceptar el parámetro y no usarlo
         dejaría a alguien creyendo que le ha comprado el plan a su empresa. */
      throw new BadRequestException(
        `El plan ${spec.nombre} es individual: no se contrata para una organización.`,
      );
    }
    if (deEmpresa && (body.seats ?? 0) < spec.asientosMinimos) {
      throw new BadRequestException(
        `El plan ${spec.nombre} empieza en ${spec.asientosMinimos} asientos.`,
      );
    }

    const organizationId = body.organizationId
      ? await this.organizacionPropia(body.organizationId, userId)
      : await this.organizacionPersonal(userId);

    const [suscripcion, email] = await Promise.all([
      this.suscripcion(organizationId),
      this.correo(userId),
    ]);

    return this.stripe.createCheckout({
      organizationId,
      tier: body.tier,
      seats: body.seats,
      email,
      stripeCustomerId: suscripcion?.stripeCustomerId ?? null,
      volverA: deEmpresa ? `/dashboard/organizations/${organizationId}` : '/dashboard/plans',
    });
  }

  /** El portal de Stripe: tarjeta, recibos y baja. Solo para quien ya es cliente. */
  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abre el portal de facturación de Stripe' })
  @ApiResponse({ status: 200, description: '{ url } a la que mandar el navegador' })
  async portal(@Request() req: Express.Request) {
    const { stripeCustomerId } = await this.cliente(req.user!.userId);

    if (!stripeCustomerId) {
      throw new BadRequestException('Todavía no tienes ninguna suscripción que gestionar.');
    }

    return this.stripe.createPortal(stripeCustomerId);
  }

  /* ─── Lo que hay que preguntar por ahí ─────────────────────────────────── */

  /**
   * La organización que va a pagar, comprobando que sea de quien paga.
   *
   * ⚠️ **Se exige ser el dueño, no bastar con estar dentro.** Contratar cuesta
   * dinero y un `ADMIN` puede invitar y quitar gente, pero no comprometer la
   * tarjeta de nadie.
   */
  private async organizacionPropia(organizationId: string, userId: string): Promise<string> {
    const organizacion = oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationView>(
          { cmd: 'billing_org_one' },
          { organizationId, userId },
        ),
      ),
    );

    if (organizacion.ownerUserId !== userId) {
      throw new BadRequestException('Solo quien creó la organización puede contratar su plan.');
    }
    return organizacion.id;
  }

  /**
   * La organización personal, creándola si hoy no existe.
   *
   * ⚠️ Es **el único sitio de este controlador que la crea**, y es a propósito:
   * aquí hay una intención de pagar y la fila hace falta para poder guardar la
   * suscripción. Las lecturas —`resumen`, `estado`— no la crean, porque sin fila
   * el plan ya es el correcto y crearla convertiría cada carga de pantalla en
   * una escritura.
   */
  private async organizacionPersonal(userId: string): Promise<string> {
    const organizacion = await firstValueFrom(
      this.billingClient.send<{ id: string }>({ cmd: 'billing_personal_org' }, { userId }),
    );
    return organizacion.id;
  }

  private suscripcion(organizationId: string) {
    return firstValueFrom(
      this.billingClient.send<{ stripeCustomerId: string | null } | null>(
        { cmd: 'billing_subscription_of' },
        { organizationId },
      ),
    ).catch(() => null);
  }

  private cliente(userId: string): Promise<{ stripeCustomerId: string | null }> {
    return firstValueFrom(
      this.billingClient.send<{ stripeCustomerId: string | null }>(
        { cmd: 'billing_customer_of' },
        { userId },
      ),
    ).catch(() => ({ stripeCustomerId: null }));
  }

  private organizaciones(userId: string): Promise<OrganizationView[]> {
    return firstValueFrom(
      this.billingClient.send<OrganizationView[]>({ cmd: 'billing_orgs_of' }, { userId }),
    ).catch(() => []);
  }

  /**
   * Cuántos proyectos sostiene.
   *
   * ⚠️ **Los `DELETED` no cuentan**, igual que en `QuotaService`: si el resumen
   * los contara, la barra diría «3 de 2» sobre un tope que el servidor sí deja
   * pasar, y eso se lee como una avería.
   */
  private proyectosPropios(userId: string): Promise<number> {
    return firstValueFrom(
      this.projectsClient.send<{ status: string }[]>(
        { cmd: 'project_find_owned' },
        { ownerId: userId },
      ),
    )
      .then((propios) => propios.filter((proyecto) => proyecto.status !== 'DELETED').length)
      .catch(() => 0);
  }

  /**
   * Lo gastado del asistente este mes.
   *
   * El tope se le pasa **desde aquí**: assistant-service no conoce los planes de
   * empresa, y sin el número usaría su propia tabla por defecto — que para
   * alguien cuyo plan viene de su organización diría otra cosa que el servidor.
   */
  private cuotaDeIa(userId: string, limiteMensual: number | null): Promise<CuotaDeIa> {
    return firstValueFrom(
      this.assistantClient.send<CuotaDeIa>({ cmd: 'assistant_quota' }, { userId, limiteMensual }),
    ).catch(() => ({
      usados: 0,
      limite: limiteMensual ?? 0,
      reinicia: primeroDelMesQueViene(),
    }));
  }

  /**
   * El correo, solo para rellenarlo en la página de Stripe.
   *
   * Si no se puede resolver **no se cae nada**: Stripe lo pide en su propio
   * formulario. Perder el autorrelleno es un roce; perder el pago, no.
   */
  private correo(userId: string): Promise<string | undefined> {
    return firstValueFrom(
      this.credentialsClient.send<{ credential?: { email?: string } }>(
        { cmd: 'user_find_one' },
        { id: userId },
      ),
    )
      .then((perfil) => perfil?.credential?.email)
      .catch(() => undefined);
  }
}

/**
 * Cuándo vuelve a cero el contador, si no se pudo preguntar.
 *
 * Es la misma cuenta que hace `QuotaService` de assistant-service. Se repite
 * —ocho líneas— en vez de dejar el campo vacío: la pantalla escribe «vuelven el
 * 1 de septiembre» y un `null` ahí saldría como «Invalid Date».
 */
function primeroDelMesQueViene(): string {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1)).toISOString();
}

/** Solo para que el tipo de `status` viaje entero hasta el resumen. */
export type { SubscriptionStatus, PlanTier };
