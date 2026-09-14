import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type BillingSummary,
  CheckoutBodyDto,
  type CongeladoView,
  OrganizationPermission,
  type OrganizationView,
  PLANS,
  PLAN_LIST,
  type PlanQuotas,
  PlanTier,
  type QuotaExcedida,
  QuotaKind,
  type SubscriptionStatus,
  type Tope,
  cabe,
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
  @ApiOperation({ summary: 'Plan, topes y consumo de una organización de quien pregunta' })
  async resumen(
    @Request() req: Express.Request,
    @Query('organizationId') organizationIdPedida?: string,
  ): Promise<BillingSummary> {
    const userId = req.user!.userId;

    /* 🔴 **La organización se valida, no se cree.** Llega de la pantalla, que la
       saca de una cookie que escribe el navegador: sin esta comprobación, poner
       ahí el identificador de otra empresa enseñaría su plan y su consumo. Sin
       parámetro cae en la personal. */
    const organizationId = await this.quota.organizacionElegida(userId, organizationIdPedida);
    const plan = await this.quota.planDe(userId, organizationId);

    const [proyectos, ia, organizaciones, cliente, bytes] = await Promise.all([
      this.proyectosDeLaOrganizacion(organizationId),
      this.cuotaDeIa(userId, plan.quotas.iaMensualPorPersona, organizationId),
      this.organizaciones(userId),
      this.cliente(userId),
      /* La única cifra que puede faltar. Cuesta dos viajes TCP y no vale la pena
         tumbar la pantalla entera si uno de los dos no contesta. */
      organizationId ? this.quota.almacenamientoDe(organizationId) : Promise.resolve(null),
    ]);

    const laSuya = organizaciones.find((una) => una.id === organizationId) ?? null;
    const asientos = laSuya?.seatsUsed ?? 0;
    const almacenamientoMb = bytes === null ? null : Math.ceil(bytes / (1024 * 1024));

    /* El tope que aplica el guard, no el del plan a secas. Si `billing_orgs_of`
       no contestó, se cae al del plan: es el peor de los dos números que se
       pueden enseñar, y equivocarse hacia «tienes menos sitio del que crees» no
       manda a nadie a invitar a quien no va a caber. */
    const topeAsientos = laSuya ? laSuya.seatsCap : plan.quotas.asientos;

    /* 🔴 **La lista solo para quien puede resolverlo** (D7). No cuesta un viaje
       TCP de permisos: `billing_orgs_of` ya trae `myPermissions` resueltos y el
       dueño los tiene todos. Quien no puede verla recibe `null` —«no te toca
       saberlo»— y no `[]`, que le diría que no hay nadie congelado. */
    const puedeVerlos =
      laSuya !== null &&
      (laSuya.soyDueno || laSuya.myPermissions[OrganizationPermission.CAN_MANAGE_BILLING] === true);

    const congelados =
      puedeVerlos && organizationId ? await this.congeladosDe(organizationId) : null;

    return {
      organizationId: plan.organizationId,
      tier: plan.tier,
      status: plan.status,
      quotas: plan.quotas,
      uso: { proyectos, iaMensual: ia.usados, asientos, almacenamientoMb },
      excedidas: excedidasDe(
        plan.quotas,
        { proyectos, iaMensual: ia.usados, asientos, almacenamientoMb },
        topeAsientos,
      ),
      congelados,
      iaReiniciaEn: ia.reinicia,
      pruebaTerminaEn: plan.trialEndsAt,
      cancelaEn: plan.cancelAt,
      cobroDisponible: this.stripe.enabled,
      gestionable: Boolean(cliente.stripeCustomerId),
      organizaciones: organizaciones.map((organizacion) => ({
        id: organizacion.id,
        name: organizacion.name ?? '',
        tier: organizacion.tier,
        soyDueno: organizacion.soyDueno,
        myRoleName: organizacion.myRoleName,
      })),
    };
  }

  /**
   * ¿Estoy yo en solo lectura en esta organización?
   *
   * Lo pide la cinta que se pinta en toda la aplicación (D11 de
   * `docs/PLAN-ASIENTOS-CONGELADOS.md`). Es el otro lado de `resumen.congelados`:
   * aquella lista es para quien puede **resolverlo**, y esto es para quien lo
   * **sufre**. Sin ella, la primera noticia que tiene alguien congelado es un
   * botón que no responde, y eso se lee como una avería.
   *
   * 🔴 **Existe suelto, y no como un campo de `/me/organizations`, por la
   * caché.** Esa lista se guarda 30 s en Redis (`ORGS_TTL`) porque la pide el
   * armazón en cada carga de cada pantalla. Meter ahí un dato **derivado** como
   * este rompería el invariante 3 —volver a pagar descongela *en el mismo
   * instante*—: habría gente con la cinta puesta en una organización que ya
   * paga, hasta medio minuto, sin que nada fallara. Es la misma razón por la que
   * D1 se niega a guardar una columna `frozen`, un piso más arriba.
   *
   * ⚠️ **Y es barato a propósito.** Un booleano, un puesto y un tope: lo pide
   * una pantalla en cada carga, así que no se le cuelga el resumen entero —que
   * son cinco llamadas a microservicios— para pintar una cinta que casi siempre
   * no se pinta.
   */
  @Get('mi-asiento')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Si tu asiento está congelado en una organización, y tu puesto' })
  @ApiResponse({ status: 200, description: '{ congelado, puesto, tope }' })
  async miAsiento(
    @Request() req: Express.Request,
    @Query('organizationId') organizationIdPedida?: string,
  ): Promise<{ congelado: boolean; puesto: number | null; tope: Tope }> {
    const userId = req.user!.userId;

    /* La misma validación que `resumen`: llega de una cookie que escribe el
       navegador, así que se comprueba la pertenencia antes de contestar. Aquí
       filtrar de más no basta —contestar «no estás congelado» sobre una
       organización ajena es poco— pero contestar «sí» diría que existe. */
    const organizationId = await this.quota.organizacionElegida(userId, organizationIdPedida);
    if (!organizationId) return { congelado: false, puesto: null, tope: null };

    return firstValueFrom(
      this.billingClient.send<{ congelado: boolean; puesto: number | null; tope: Tope }>(
        { cmd: 'billing_seat_frozen' },
        { organizationId, userId },
      ),
      /* Sin respuesta, no se pinta la cinta. Es la misma asimetría que
         `exigirAsientoVivo`, que deja escribir si billing no contesta: las dos
         fallan hacia «puedes», y así no se le dice a nadie que está en solo
         lectura por una caída de un servicio. */
    ).catch(() => ({ congelado: false, puesto: null, tope: null }));
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

    /* ⚠️ **La organización es obligatoria en todos los planes**, y desde
       2026-08-26 no hay excepción. Antes los planes «individuales» iban sin ella
       —a la organización personal, que era invisible— y los de empresa la
       exigían: dos caminos, y una rama en cada sitio que resolviera una cuota.
       Ahora la personal es una organización normal de un asiento, así que
       siempre se paga *para* una y quien la elige es quien paga, no el
       servidor. */
    if (!body.organizationId) {
      throw new BadRequestException(
        `El plan ${spec.nombre} se contrata para una organización: elige cuál.`,
      );
    }
    if ((body.seats ?? 0) < spec.asientosMinimos) {
      throw new BadRequestException(
        `El plan ${spec.nombre} empieza en ${spec.asientosMinimos} asientos.`,
      );
    }
    /**
     * 🔴 **Y el techo del plan, que no lo comprobaba nadie.**
     *
     * `quotas.asientos` decía 15 en Equipo y 100 en Negocio, la tabla de precios
     * lo pintaba, y `body.seats` no se comparaba contra él en ninguna parte: se
     * podía abrir un checkout de Equipo con 500 asientos, Stripe cobraba 500 y
     * la organización metía a 500 personas —porque lo único que mira al invitar
     * es `Subscription.seats`, no el catálogo—.
     *
     * No era un agujero de dinero (se cobra por asiento), pero sí una promesa
     * rota en las dos direcciones: la tabla afirmaba un techo inexistente, y el
     * escalón a Negocio dejaba de tener sentido si Equipo escalaba igual.
     *
     * Es el patrón de la trampa 23 de CLAUDE.md, la tercera vez: **una cuota que
     * no se comprueba no da ningún error.** El número llevaba puesto desde el
     * principio y no lo invocaba nadie.
     *
     * `cabe()` y no un `<` a mano: `ENTERPRISE` tiene `SIN_TOPE`, y `500 <
     * null` es `false` — o sea que el plan sin límite se comportaría como el más
     * restrictivo de todos. Aquí se pregunta si caben `seats`, así que se compara
     * `seats - 1` («¿cabe uno más sobre los que ya hay?»).
     */
    if (!cabe((body.seats ?? 0) - 1, spec.quotas.asientos)) {
      throw new BadRequestException(
        `El plan ${spec.nombre} llega hasta ${spec.quotas.asientos} asientos. ` +
          'Para más, el siguiente plan.',
      );
    }

    const organizationId = await this.organizacionPropia(body.organizationId, userId);

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
      /**
       * 🔴 **`/main/billing`, y antes era `/dashboard/organizations/<id>`.**
       *
       * Dos cosas mal en un solo literal, y las dos de cara a quien acaba de
       * pagar:
       *
       * 1. **`/dashboard` no existe.** El `basePath` de dashboard-front es
       *    `/main` desde el renombrado de la etapa del rediseño; ese barrido fue
       *    del frontend y estos literales viven aquí. Pagabas y aterrizabas en
       *    el 404 del shell — con el cobro hecho, porque lo concede el webhook y
       *    no la vuelta (I3).
       * 2. **Y `/main/organizations/<id>` tampoco existe.** Bajo
       *    `(private)/organizations/` solo quedan `new` e `invitation`.
       *
       * `/main/billing` es el destino correcto y no una aproximación: es donde
       * está montado `PaymentReturn`, que es lo único que sabe leer el `?pago=ok`
       * que Stripe añade a esta URL.
       */
      volverA: '/main/billing',
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

  /**
   * Quién está en solo lectura en esta organización.
   *
   * ⚠️ **Se cae a lista vacía si billing-service no contesta**, igual que
   * `organizaciones()`. Es un aviso, no una puerta: quien niega la escritura es
   * el guard (A4), con su propia llamada y su propio criterio. Tumbar la
   * pantalla de facturación entera porque no se pudo pintar una tarjeta
   * informativa sería cambiar un aviso que falta por una avería.
   *
   * ⚠️ Y **no filtra por permiso**: eso ya lo decidió quien llama. El comando
   * TCP tampoco lo hace, por el mismo motivo que `billing_org_members`.
   */
  private congeladosDe(organizationId: string): Promise<CongeladoView[]> {
    return firstValueFrom(
      this.billingClient.send<{ congelados: CongeladoView[] }>(
        { cmd: 'billing_frozen_members' },
        { organizationId },
      ),
    )
      .then((corte) => corte?.congelados ?? [])
      .catch(() => []);
  }

  private organizaciones(userId: string): Promise<OrganizationView[]> {
    return firstValueFrom(
      this.billingClient.send<OrganizationView[]>({ cmd: 'billing_orgs_of' }, { userId }),
    ).catch(() => []);
  }

  /**
   * Cuántos proyectos tiene la organización.
   *
   * 🔴 **Contaba los de la persona, y el tope se cuenta por organización.** Eran
   * dos cifras distintas puestas en la misma barra: quien tuviera dos proyectos
   * propios en un equipo con veinte veía «2 de 25» y creía que le quedaban
   * veintitrés. Ahora las dos mitades de la barra —lo gastado y el tope— miden
   * lo mismo, que es lo mínimo que se le puede pedir a una barra.
   *
   * ⚠️ **Los `DELETED` no cuentan**, igual que en `QuotaService.exigirProyecto`:
   * si el resumen los contara, la barra diría «3 de 2» sobre un tope que el
   * servidor sí deja pasar, y eso se lee como una avería.
   */
  private proyectosDeLaOrganizacion(organizationId: string | null): Promise<number> {
    if (!organizationId) return Promise.resolve(0);

    return firstValueFrom(
      this.projectsClient.send<{ status: string }[]>(
        { cmd: 'project_find_by_organization' },
        { organizationId },
      ),
    )
      .then((suyos) => suyos.filter((proyecto) => proyecto.status !== 'DELETED').length)
      .catch(() => 0);
  }

  /**
   * Lo gastado del asistente este mes.
   *
   * El tope se le pasa **desde aquí**: assistant-service no conoce los planes de
   * empresa, y sin el número usaría su propia tabla por defecto — que para
   * alguien cuyo plan viene de su organización diría otra cosa que el servidor.
   */
  private cuotaDeIa(
    userId: string,
    limiteMensual: number | null,
    organizationId: string | null,
  ): Promise<CuotaDeIa> {
    return firstValueFrom(
      this.assistantClient.send<CuotaDeIa>(
        { cmd: 'assistant_quota' },
        { userId, limiteMensual, organizationId },
      ),
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
 * Qué topes tiene ya rebasados esta organización.
 *
 * ## 🔴 La trampa 4 del encargo, dicha en vez de sufrida
 *
 * *«Bajar de plan con más proyectos de los que el plan permite es el caso que
 * nadie diseña y todos sufren.»* Se llega aquí sin haber hecho nada: no sube el
 * número, baja el techo — al bajar de plan, al cancelar, al fallar un cobro y al
 * acabarse el mes gratis.
 *
 * **Y lo que pasa entonces es nada** (D5 de `docs/PLAN-CUOTAS.md`): no se borra,
 * no se archiva y no se congela. Lo que ya hay se abre, se edita y se borra; lo
 * único que no se puede es añadir uno más, exactamente igual que si se hubiera
 * llegado al tope por arriba. Congelar cuarenta proyectos por una tarjeta
 * caducada es la forma más rápida de que un cliente se vaya con sus datos
 * dentro, y archivar es elegir a quién se le apaga el trabajo — eso no lo puede
 * decidir un webhook.
 *
 * ⚠️ **Esto no niega nada.** Quien niega es `QuotaService`, en el servidor y con
 * las mismas cifras de `plans.ts`. Esto existe para que quien administra lo vea
 * **antes** de descubrirlo pulsando un botón que no responde: un tope rebasado
 * sin explicación se lee como una avería, y una avería no se paga, se abandona.
 *
 * ⚠️ **`cabe()` y no un `<`.** Con `SIN_TOPE` —que es `null`— un `actual > tope`
 * suelto compara contra cero y marcaría como excedido al plan que no tiene
 * límite, que es justo al revés.
 */
export function excedidasDe(
  quotas: PlanQuotas,
  uso: {
    proyectos: number;
    iaMensual: number;
    asientos: number;
    almacenamientoMb: number | null;
  },
  /**
   * El tope de asientos que **aplica de verdad**: `min(seats, quotas.asientos)`.
   *
   * 🔴 **Obligatorio y aparte de `quotas` a propósito.** Es el único tope de los
   * cuatro que no sale del plan, y usar `quotas.asientos` aquí era una mentira
   * medible: una organización con el plan Equipo (25) que solo contrató 5
   * asientos y tiene 7 personas ve «7 de 25, todo bien» mientras el guard
   * congela a 2 (A4). El resumen decía que no pasaba nada sobre gente que ya
   * estaba en solo lectura.
   *
   * Un parámetro obligatorio y no un valor por defecto: con un `?? quotas.asientos`
   * al final, quien añadiera la quinta llamada a esta función se llevaría el
   * número equivocado sin escribir una línea de más y sin un error.
   */
  topeAsientos: Tope,
): QuotaExcedida[] {
  const excedidas: QuotaExcedida[] = [];

  const mirar = (kind: QuotaKind, tope: Tope, actual: number | null) => {
    /* `actual === null` es «no se pudo medir», no «cero». Marcar un exceso sobre
       una cifra que no se tiene sería inventarse el aviso más caro de la
       pantalla. */
    if (tope === null || actual === null) return;
    /* `cabe` contesta «¿cabe uno más?», así que estar al tope justo no es
       excederlo: 25 de 25 está lleno, no rebasado, y decirle «te has pasado» a
       quien está exactamente donde compró es una acusación falsa. */
    if (actual <= tope) return;
    excedidas.push({ kind, tope, actual });
  };

  mirar(QuotaKind.PROYECTOS, quotas.proyectos, uso.proyectos);
  /* `topeAsientos` y no `quotas.asientos`: ver el parámetro. Es el mismo número
     contra el que congela `QuotaService.exigirAsientoVivo`, y tienen que ser el
     mismo o la pantalla y el guard cuentan distinto. */
  mirar(QuotaKind.ASIENTOS, topeAsientos, uso.asientos);
  mirar(QuotaKind.ALMACENAMIENTO, quotas.almacenamientoOrgMb, uso.almacenamientoMb);
  /**
   * ⚠️ **La IA también, y es la menos evidente.** Alguien que gastó 200 mensajes
   * con BUSINESS y baja a FREE —13— pasa el resto del mes por encima. No se le
   * quita nada de lo que ya escribió, pero no puede mandar otro hasta el día 1,
   * y sin esto el 402 le llegaría sin ninguna pantalla que lo hubiera avisado.
   */
  mirar(QuotaKind.IA_MENSUAL, quotas.iaMensualPorPersona, uso.iaMensual);

  return excedidas;
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
