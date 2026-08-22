import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AcceptInvitationBodyDto,
  ChangeOrganizationMemberRoleBodyDto,
  ChangeSeatsBodyDto,
  CreateOrganizationBodyDto,
  InviteOrganizationMemberBodyDto,
  type OrganizationMemberView,
  type OrganizationView,
  RenameOrganizationBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { oFalla } from './fallos';
import { StripeService } from './stripe.service';

/**
 * Las organizaciones de quien llama: crearlas y entrar en ellas.
 *
 * ⚠️ **Cuelga de `/me` y la de al lado no**, y la razón es la misma que separa
 * `MyInvitationsController` de `ProjectInvitationsController`: aceptar una
 * invitación es lo que haces **antes** de pertenecer, así que no se puede
 * exigir pertenencia para llegar hasta aquí. Todo lo que sí exige estar dentro
 * vive en `OrganizationsController`, donde billing-service comprueba el papel.
 */
@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/organizations')
export class MyOrganizationsController {
  constructor(
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {}

  /**
   * Las organizaciones de empresa a las que perteneces.
   *
   * ⚠️ **La personal no sale**, y no es un olvido: no tiene nombre, no admite
   * miembros y no hay nada que gestionar en ella. Enseñarla en el selector
   * obligaría a explicar en la pantalla una fila que existe solo para que el
   * modelo tenga una sola forma.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Las organizaciones a las que perteneces' })
  mias(@Request() req: Express.Request) {
    return firstValueFrom(
      this.billingClient.send<OrganizationView[]>(
        { cmd: 'billing_orgs_of' },
        { userId: req.user!.userId },
      ),
    );
  }

  /**
   * Crea una organización de empresa.
   *
   * ⚠️ **Nace sin plan pagado.** Se crea aquí y se paga después, con el
   * checkout: quien concede el plan es el webhook de Stripe. Mientras tanto la
   * organización existe con las cuotas de FREE, que es lo honesto — todavía no
   * ha pagado nadie.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crea una organización de empresa' })
  @ApiResponse({ status: 201, description: 'Creada, sin plan hasta que se pague' })
  @ApiResponse({ status: 400, description: 'Ese plan no crea organización, o faltan asientos' })
  async crear(@Request() req: Express.Request, @Body() body: CreateOrganizationBodyDto) {
    const userId = req.user!.userId;
    const ownerEmail = (await this.correo(userId)) ?? '';

    return oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationView>(
          { cmd: 'billing_org_create' },
          { ownerUserId: userId, ownerEmail, name: body.name, tier: body.tier, seats: body.seats },
        ),
      ),
    );
  }

  /**
   * Acepta una invitación con el token del enlace.
   *
   * ⚠️ **El correo lo pone el gateway desde el token de sesión, nunca el
   * cuerpo.** billing-service comprueba que quien acepta sea a quien se invitó,
   * y si esa dirección viniera del cliente la comprobación sería una formalidad:
   * bastaría con mandar la del sobre para entrar en cualquier organización cuyo
   * enlace se hubiera reenviado.
   */
  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acepta una invitación a una organización' })
  @ApiResponse({ status: 200, description: 'Dentro. Devuelve la organización' })
  @ApiResponse({ status: 410, description: 'La invitación no vale, ha caducado o es de otro' })
  async aceptar(@Request() req: Express.Request, @Body() body: AcceptInvitationBodyDto) {
    const userId = req.user!.userId;
    const email = await this.correo(userId);

    if (!email) {
      throw new BadRequestException('No se pudo comprobar tu correo. Vuelve a iniciar sesión.');
    }

    return oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationView>(
          { cmd: 'billing_org_accept' },
          { token: body.token, userId, email },
        ),
      ),
    );
  }

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
 * El portal de una organización: sus miembros, sus asientos y su registro.
 *
 * ## Quién puede qué lo decide billing-service, no un guard de aquí
 *
 * ⚠️ **No hay un `OrganizationRoleGuard`**, y es a propósito. El papel dentro de
 * una organización solo lo sabe billing-service —el gateway no tiene esa
 * tabla—, así que un guard aquí sería una llamada TCP más por petición para
 * repetir una comprobación que el comando ya hace. Cada comando exige el papel
 * que le toca y devuelve `SIN_PERMISO`; `oFalla` lo convierte en 403.
 *
 * Es distinto de `ProjectPermissionGuard`, que sí existe porque ahí hay **una**
 * pregunta —el mapa de permisos— compartida por cuarenta rutas.
 */
@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('organizations/:organizationId')
export class OrganizationsController {
  private readonly log = new Logger(OrganizationsController.name);
  private readonly appUrl: string;

  constructor(
    private readonly stripe: StripeService,
    config: ConfigService,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
  ) {
    this.appUrl = config.get<string>('PUBLIC_APP_URL') || 'http://localhost:4100';
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Una organización, si perteneces a ella' })
  async una(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return oFalla(await this.leer(organizationId, req.user!.userId));
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renombra la organización' })
  async renombrar(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: RenameOrganizationBodyDto,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationView>(
          { cmd: 'billing_org_rename' },
          { organizationId, userId: req.user!.userId, name: body.name },
        ),
      ),
    );
  }

  /**
   * Quién está dentro, con su nombre puesto.
   *
   * ⚠️ **El nombre lo pega el gateway.** billing-service solo guarda el correo
   * con el que se invitó —no tiene el directorio— así que sin este paso la
   * lista saldría con direcciones de correo en vez de personas. Si el
   * directorio no contesta se queda el correo, que es peor pero no está vacío.
   */
  @Get('members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Los miembros de la organización' })
  async miembros(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    const miembros = oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationMemberView[]>(
          { cmd: 'billing_org_members' },
          { organizationId, userId: req.user!.userId },
        ),
      ),
    );

    return this.conNombres(miembros);
  }

  /**
   * Invita a alguien por correo.
   *
   * ⚠️ **Devuelve el enlace, y por ahora es la única forma de que llegue.**
   * Mandarlo por correo exigiría un comando nuevo en credentials-service —el
   * único que tiene `MailService`— y eso es una ruta de escritura de correo
   * arbitrario abierta al gateway. Mientras no se decida, quien invita copia el
   * enlace y lo manda: se ve en la pantalla y no hay un correo que se pierda en
   * la carpeta de no deseados el día de la demostración.
   *
   * ⚠️ El token en claro **solo existe en esta respuesta**. En la base está su
   * hash, así que perderlo significa cancelar la invitación y volver a invitar.
   */
  @Post('members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invita a alguien a la organización' })
  @ApiResponse({ status: 201, description: '{ email, enlace, expiraEn }' })
  @ApiResponse({ status: 409, description: 'Ya está dentro, o no quedan asientos' })
  async invitar(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: InviteOrganizationMemberBodyDto,
  ) {
    const invitacion = oFalla(
      await firstValueFrom(
        this.billingClient.send<{ email: string; token: string; expiraEn: string }>(
          { cmd: 'billing_org_invite' },
          {
            organizationId,
            porUserId: req.user!.userId,
            email: body.email,
            role: body.role,
          },
        ),
      ),
    );

    return {
      email: invitacion.email,
      expiraEn: invitacion.expiraEn,
      enlace: `${this.appUrl}/dashboard/organizations/invitation?token=${invitacion.token}`,
    };
  }

  @Patch('members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambia el papel de un miembro' })
  async cambiarRol(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ChangeOrganizationMemberRoleBodyDto,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_member_role' },
          { organizationId, porUserId: req.user!.userId, userId, role: body.role },
        ),
      ),
    );
  }

  /**
   * Saca a alguien, o cancela su invitación.
   *
   * El parámetro es el `userId` de quien ya entró; para una invitación que aún
   * nadie ha aceptado **no hay `userId` todavía**, así que se admite el correo
   * en su lugar. Es la misma fila de la tabla, identificada por lo único que se
   * sabe de ella en cada momento.
   */
  @Delete('members/:idOrEmail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Saca a un miembro o cancela su invitación' })
  async quitar(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('idOrEmail') idOrEmail: string,
  ) {
    const esCorreo = idOrEmail.includes('@');

    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_member_remove' },
          {
            organizationId,
            porUserId: req.user!.userId,
            ...(esCorreo ? { email: idOrEmail } : { userId: idOrEmail }),
          },
        ),
      ),
    );
  }

  /**
   * Cambia los asientos contratados.
   *
   * ## El orden importa, y este es el menos malo
   *
   * Son dos escrituras en dos sitios —Stripe y nuestra base— y no hay
   * transacción que las abarque. El orden elegido:
   *
   * 1. **Se comprueba que quien pide sea el dueño.** Antes de tocar Stripe:
   *    esto cuesta dinero y un `ADMIN` no compromete la tarjeta de nadie.
   * 2. **Se comprueba que quepa la gente que ya está.** Bajar a tres con cinco
   *    dentro dejaría la organización por encima de lo que paga, y la única
   *    salida sería echar a alguien automáticamente — que es justo lo que la
   *    trampa 4 del encargo prohíbe.
   * 3. **Stripe primero, nuestra base después.** Si falla lo segundo, el
   *    webhook de `customer.subscription.updated` llega detrás y escribe el
   *    número bueno. Al revés —nuestra base primero— un fallo de Stripe dejaría
   *    a la organización con diez asientos pagando tres, que es la única de las
   *    dos incoherencias que regala algo.
   *
   * ⚠️ Y el paso 2 se repite dentro de billing-service, que es quien lo decide
   * de verdad: aquí se hace para no llamar a Stripe sabiendo que va a haber que
   * deshacerlo, no para autorizar nada.
   */
  @Patch('seats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambia los asientos contratados' })
  @ApiResponse({ status: 409, description: 'Hay más gente dentro de la que cabría' })
  async asientos(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: ChangeSeatsBodyDto,
  ) {
    const userId = req.user!.userId;
    const organizacion = oFalla(await this.leer(organizationId, userId));

    if (organizacion.ownerUserId !== userId) {
      throw new ForbiddenException('Solo quien creó la organización cambia sus asientos.');
    }
    if (body.seats < organizacion.seatsUsed) {
      throw new ConflictException(
        `Hay ${organizacion.seatsUsed} asientos ocupados, contando invitaciones pendientes. ` +
          `Saca a alguien antes de bajar a ${body.seats}.`,
      );
    }

    const suscripcion = await firstValueFrom(
      this.billingClient.send<{ stripeSubscriptionId: string | null } | null>(
        { cmd: 'billing_subscription_of' },
        { organizationId },
      ),
    ).catch(() => null);

    if (suscripcion?.stripeSubscriptionId) {
      await this.stripe.cambiarAsientos(suscripcion.stripeSubscriptionId, body.seats);
    }

    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_seats' },
          { organizationId, userId, seats: body.seats },
        ),
      ),
    );
  }

  /**
   * El registro de la organización: qué pasó y cuándo.
   *
   * 🔴 **Es la trampa 3 del encargo hecha pantalla.** El mes gratis se cobra al
   * segundo y «no me avisaron» es la queja más cara de este terreno: aquí está
   * cada cambio de plan con su instante y con el evento de Stripe que lo causó.
   */
  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lo que le ha pasado al plan de esta organización' })
  async historial(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_history' },
          { organizationId, userId: req.user!.userId },
        ),
      ),
    );
  }

  /* ─── Lo de siempre ────────────────────────────────────────────────────── */

  private leer(organizationId: string, userId: string) {
    return firstValueFrom(
      this.billingClient.send<OrganizationView>(
        { cmd: 'billing_org_one' },
        { organizationId, userId },
      ),
    );
  }

  /** Los correos de la lista, con el nombre de quien ya tiene cuenta. */
  private async conNombres(miembros: OrganizationMemberView[]) {
    const ids = miembros.map((miembro) => miembro.userId).filter((id): id is string => Boolean(id));

    if (ids.length === 0) return miembros;

    const perfiles = await firstValueFrom(
      this.credentialsClient.send<Perfil[]>({ cmd: 'user_find_by_ids' }, { ids }),
    ).catch((error: Error) => {
      this.log.warn(`No se pudieron resolver los nombres de la organización: ${error.message}`);
      return [] as Perfil[];
    });

    const porId = new Map(perfiles.map((perfil) => [perfil.id, perfil]));

    return miembros.map((miembro) => {
      const perfil = miembro.userId ? porId.get(miembro.userId) : undefined;
      const nombre = [perfil?.firstName, perfil?.lastName].filter(Boolean).join(' ').trim();
      return { ...miembro, name: nombre || null };
    });
  }
}

/** Lo que hace falta del directorio para ponerle cara a un correo. */
interface Perfil {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
}
