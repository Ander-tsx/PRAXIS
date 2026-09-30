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
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AcceptInvitationBodyDto,
  ChangeOrganizationMemberRoleBodyDto,
  ChangeSeatsBodyDto,
  CreateOrganizationBodyDto,
  InviteOrganizationMemberBodyDto,
  type OrganizationMemberView,
  OrganizationRoleBodyDto,
  type OrganizationView,
  PLANS,
  PlanTier,
  ProjectRoleTemplateBodyDto,
  RenameOrganizationBodyDto,
  TransferOrganizationBodyDto,
} from '@praxis/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { IMAGEN_MAX_BYTES, validarImagenSubida } from '../common/imagen';
import { oFalla } from './fallos';
import { QuotaService } from './quota.service';
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
    private readonly cuotas: QuotaService,
  ) {}

  /**
   * Las organizaciones de empresa a las que perteneces.
   *
   * ⚠️ **La personal también sale**, desde 2026-08-26. Antes se escondía —no
   * tenía nombre ni admitía miembros— pero desde que la organización **contiene**
   * los proyectos, esconderla dejaba a quien trabaja solo sin poder llegar a los
   * suyos desde el selector.
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
  @ApiResponse({
    status: 402,
    description: 'Ya tienes el máximo de organizaciones (QUOTA_EXCEEDED)',
  })
  async crear(@Request() req: Express.Request, @Body() body: CreateOrganizationBodyDto) {
    const userId = req.user!.userId;

    /* 🔴 **El tope, antes de tocar nada.** Existía escrito desde la etapa
       anterior y no lo comprobaba ningún sitio: hasta 2026-08-28 se podían crear
       sin límite, y con el plan valiendo solo dentro de su organización eso es
       multiplicar las cuotas gratuitas por cuantas quieras crear. */
    await this.cuotas.exigirOrganizacion(userId);

    const ownerEmail = (await this.correo(userId)) ?? '';

    return oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationView>(
          { cmd: 'billing_org_create' },
          {
            ownerUserId: userId,
            ownerEmail,
            name: body.name,
            /* Nace gratuita. El plan lo concede el webhook de Stripe y solo el
               webhook: mandar aquí un `tier` de pago crearía una organización
               con una promesa dentro que nadie ha cobrado. */
            tier: PlanTier.FREE,
            seats: PLANS[PlanTier.FREE].quotas.asientos ?? 1,
          },
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
    /* Los dos que hacen falta para la salida de un miembro: comprobar que no
       deja proyectos sin responsable, y soltar sus tareas. */
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
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
  @ApiOperation({ summary: 'Cambia el nombre, el icono o el color de la organización' })
  async renombrar(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: RenameOrganizationBodyDto,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationView>(
          { cmd: 'billing_org_rename' },
          {
            organizationId,
            userId: req.user!.userId,
            name: body.name,
            iconKey: body.iconKey,
            color: body.color,
          },
        ),
      ),
    );
  }

  /**
   * Sube la imagen de la organización. Misma puerta que renombrar
   * (`canManageOrganization`, que comprueba billing-service). Devuelve la
   * organización con la `imageUrl` nueva.
   */
  @Post('image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGEN_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Sube la imagen de la organización' })
  async ponerImagen(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    validarImagenSubida(file);
    return oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationView>(
          { cmd: 'billing_org_set_image' },
          {
            organizationId,
            userId: req.user!.userId,
            mimeType: file.mimetype,
            base64: file.buffer.toString('base64'),
          },
        ),
      ),
    );
  }

  @Delete('image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quita la imagen de la organización' })
  async quitarImagen(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send<OrganizationView>(
          { cmd: 'billing_org_delete_image' },
          { organizationId, userId: req.user!.userId },
        ),
      ),
    );
  }

  /**
   * Sirve los bytes de la imagen a quien pertenece a la organización. Un año de
   * caché inmutable: la URL lleva `?v=<epoch>` y cambia con cada imagen nueva.
   */
  @Get('image')
  @ApiOperation({ summary: 'Bytes de la imagen de la organización' })
  async leerImagen(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Res() res: Response,
  ) {
    const imagen = oFalla(
      await firstValueFrom(
        this.billingClient.send<{ mimeType: string; size: number; base64: string } | null>(
          { cmd: 'billing_org_get_image' },
          { organizationId, userId: req.user!.userId },
        ),
      ),
    );
    if (!imagen) throw new NotFoundException('Esa organización no tiene imagen');

    const bytes = Buffer.from(imagen.base64, 'base64');
    res.setHeader('Content-Type', imagen.mimeType);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(bytes);
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
    const organizacion = await this.leer(organizationId, req.user!.userId).catch(() => null);

    const invitacion = oFalla(
      await firstValueFrom(
        this.billingClient.send<{ email: string; token: string; expiraEn: string }>(
          { cmd: 'billing_org_invite' },
          {
            organizationId,
            porUserId: req.user!.userId,
            email: body.email,
            roleId: body.roleId,
          },
        ),
      ),
    );

    /* 🔴 **`/main`, no `/dashboard`.** La pantalla existe —
       `(private)/organizations/invitation/page.tsx`— pero bajo el `basePath`
       nuevo. Con el prefijo viejo, lo primero que veía alguien que todavía no es
       cliente era el 404 del shell, y era lo único que podía hacer con el
       correo. */
    const enlace = `${this.appUrl}/main/organizations/invitation?token=${invitacion.token}`;

    /* 🔴 **El correo se manda, y el enlace se sigue devolviendo.** Las dos
       cosas: un correo se pierde en no deseados el día de la demostración, y el
       token en claro solo existe en esta respuesta —en la base queda su hash—.
       Que se pueda copiar además de enviarse no cuesta nada y salva el caso.

       ⚠️ **No se espera a que salga.** Si el envío falla, la invitación ya está
       creada y el enlace está delante: tumbar la petición por el correo sería
       perder el token para siempre por un problema de otro sistema. */
    const nombre = await this.nombreDe(req.user!.userId);
    const enviado = await firstValueFrom(
      this.credentialsClient.send<{ enviado: boolean }>(
        { cmd: 'mail_send_invitation' },
        {
          email: invitacion.email,
          organizacion: organizacion?.name ?? 'PRAXIS',
          invitaPor: nombre,
          enlace,
        },
      ),
    ).catch((error: Error) => {
      this.log.warn(`No se pudo mandar la invitación a ${invitacion.email}: ${error.message}`);
      return { enviado: false };
    });

    return {
      email: invitacion.email,
      expiraEn: invitacion.expiraEn,
      enlace,
      /** Si el correo salió. La pantalla enseña el enlace igual, pero lo dice. */
      correoEnviado: enviado.enviado,
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
          { organizationId, porUserId: req.user!.userId, userId, roleId: body.roleId },
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
  /**
   * Saca a un miembro, o cancela su invitación.
   *
   * ## La salida de alguien no es solo liberar su asiento
   *
   * 🔴 **Se niega si todavía es responsable de algún proyecto de aquí**, y dice
   * de cuáles. Es exactamente lo que ya hace administración al borrar una
   * cuenta, y por lo mismo: un proyecto sin responsable no lo puede administrar
   * nadie —el responsable es el único bypass de permisos que existe— y el
   * sistema eligiendo sucesor por su cuenta es lo que el plan prohíbe. Se
   * traspasa primero.
   *
   * ⚠️ **Y sus tareas se sueltan, no se reasignan.** Elegir a quién le cae el
   * trabajo de quien se va es una decisión de equipo. Sin encargado la tarea
   * sigue en su columna y cualquiera la recoge; a dedo, alguien se encuentra
   * trabajo que no pidió.
   *
   * ⚠️ **Solo en los proyectos de ESTA organización.** Se sale de una, no de
   * PRAXIS.
   *
   * ⚠️ Si no se pueden soltar, **se sale igual** y se registra: dejar a alguien
   * atrapado en un equipo porque tasks-service no contesta es peor que un nombre
   * de más en una tarjeta, que se quita a mano.
   */
  @Delete('members/:idOrEmail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Saca a un miembro o cancela su invitación' })
  @ApiResponse({ status: 409, description: 'Todavía es responsable de proyectos de aquí' })
  async quitar(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('idOrEmail') idOrEmail: string,
  ) {
    const esCorreo = idOrEmail.includes('@');

    /* Una invitación sin aceptar no tiene trabajo detrás: se cancela y ya. */
    if (!esCorreo) {
      await this.exigirQueNoDejeProyectosHuerfanos(organizationId, idOrEmail);
    }

    const salida = oFalla(
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

    const soltadas = esCorreo ? 0 : await this.soltarSusTareas(organizationId, idOrEmail);
    return { ...(salida as object), tareasSoltadas: soltadas };
  }

  /**
   * Que no deje ningún proyecto sin responsable al salir.
   *
   * Mismo criterio y mismo mensaje que administración al borrar una cuenta: se
   * dicen **cuáles**, porque sin los nombres no se puede arreglar.
   */
  private async exigirQueNoDejeProyectosHuerfanos(organizationId: string, userId: string) {
    const deLaOrganizacion = await firstValueFrom(
      this.projectsClient.send<{ id: string; name: string; ownerId: string; status: string }[]>(
        { cmd: 'project_find_by_organization' },
        { organizationId },
      ),
    ).catch(() => null);

    /* Si no se puede contar, se deja salir: es la asimetría de siempre — un
       proyecto sin responsable se arregla, y alguien atrapado en un equipo por
       un servicio caído, no. */
    if (deLaOrganizacion === null) return;

    const suyos = deLaOrganizacion.filter(
      (proyecto) => proyecto.ownerId === userId && proyecto.status !== 'DELETED',
    );
    if (suyos.length === 0) return;

    throw new ConflictException(
      `Esta persona todavía es responsable de ${suyos.length} ` +
        `${suyos.length === 1 ? 'proyecto' : 'proyectos'} de la organización (${suyos
          .slice(0, 3)
          .map((proyecto) => proyecto.name)
          .join(', ')}${suyos.length > 3 ? '…' : ''}). ` +
        'Traspásalos a otra persona antes de sacarla del equipo.',
    );
  }

  /** Suelta sus tareas en los proyectos de esta organización. Nunca falla. */
  private async soltarSusTareas(organizationId: string, userId: string): Promise<number> {
    const proyectos = await firstValueFrom(
      this.projectsClient.send<{ id: string }[]>(
        { cmd: 'project_find_by_organization' },
        { organizationId },
      ),
    ).catch(() => [] as { id: string }[]);

    if (proyectos.length === 0) return 0;

    const resultado = await firstValueFrom(
      this.tasksClient.send<{ soltadas: number }>(
        { cmd: 'task_release_assignments' },
        { userId, projectIds: proyectos.map((proyecto) => proyecto.id) },
      ),
    ).catch((error: Error) => {
      this.log.warn(`No se pudieron soltar las tareas de ${userId}: ${error.message}`);
      return { soltadas: 0 };
    });

    return resultado.soltadas;
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

  /* ─── Papeles ──────────────────────────────────────────────────────────── */

  /**
   * Los papeles de la organización, con cuánta gente lleva cada uno.
   *
   * ⚠️ **No es la misma pantalla que los roles de un proyecto**, y no debería
   * serlo: son dos vocabularios distintos. Ver `OrganizationPermission`.
   */
  @Get('roles')
  @ApiOperation({ summary: 'Los papeles de la organización' })
  async papeles(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_roles' },
          { organizationId, userId: req.user!.userId },
        ),
      ),
    );
  }

  @Post('roles')
  @ApiOperation({ summary: 'Crea un papel' })
  @ApiResponse({ status: 403, description: 'No puedes dar un permiso que tú no tienes' })
  async crearPapel(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: OrganizationRoleBodyDto,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_role_create' },
          {
            organizationId,
            porUserId: req.user!.userId,
            name: body.name,
            permissions: body.permissions,
          },
        ),
      ),
    );
  }

  @Patch('roles/:roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edita un papel' })
  async editarPapel(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() body: OrganizationRoleBodyDto,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_role_update' },
          {
            organizationId,
            porUserId: req.user!.userId,
            roleId,
            name: body.name,
            permissions: body.permissions,
          },
        ),
      ),
    );
  }

  /** Falla si todavía lo lleva alguien, y dice cuánta gente hay que mover. */
  @Delete('roles/:roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra un papel que ya no lleva nadie' })
  @ApiResponse({ status: 409, description: 'Ese papel todavía lo lleva alguien' })
  async borrarPapel(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_role_delete' },
          { organizationId, porUserId: req.user!.userId, roleId },
        ),
      ),
    );
  }

  /* ─── Plantillas de rol de proyecto ────────────────────────────────────── */

  @Get('role-templates')
  @ApiOperation({ summary: 'Los roles con los que nacen los proyectos de aquí' })
  async plantillas(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_templates' },
          { organizationId, userId: req.user!.userId },
        ),
      ),
    );
  }

  /** ⚠️ Solo afecta a los proyectos que se creen a partir de ahora. */
  @Post('role-templates')
  @ApiOperation({ summary: 'Crea una plantilla de rol de proyecto' })
  async crearPlantilla(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: ProjectRoleTemplateBodyDto,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_template_save' },
          {
            organizationId,
            porUserId: req.user!.userId,
            name: body.name,
            permissions: body.permissions,
          },
        ),
      ),
    );
  }

  @Patch('role-templates/:templateId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edita una plantilla de rol de proyecto' })
  async editarPlantilla(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: ProjectRoleTemplateBodyDto,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_template_save' },
          {
            organizationId,
            porUserId: req.user!.userId,
            templateId,
            name: body.name,
            permissions: body.permissions,
          },
        ),
      ),
    );
  }

  @Delete('role-templates/:templateId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra una plantilla. No toca ningún proyecto ya creado' })
  async borrarPlantilla(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_template_delete' },
          { organizationId, porUserId: req.user!.userId, templateId },
        ),
      ),
    );
  }

  /* ─── El traspaso ──────────────────────────────────────────────────────── */

  /**
   * Le pasa la organización a otra persona.
   *
   * 🔴 **Sin esto una organización muere con su creador.** Solo lo hace quien es
   * dueño —no basta `canManageOrganization`: regalar la suscripción de otro no
   * es administrar— y quien la recibe tiene que estar ya dentro y activo.
   */
  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Traspasa la organización a otro miembro' })
  @ApiResponse({ status: 403, description: 'Solo quien es dueño puede traspasarla' })
  async traspasar(
    @Request() req: Express.Request,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: TransferOrganizationBodyDto,
  ) {
    return oFalla(
      await firstValueFrom(
        this.billingClient.send(
          { cmd: 'billing_org_transfer' },
          { organizationId, porUserId: req.user!.userId, userId: body.userId },
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

  /**
   * Cómo se llama quien invita, para que el correo lo diga.
   *
   * ⚠️ **`null` si no se puede resolver**, y el correo se manda igual con «Te
   * han invitado». Un envío que falla por no saber un nombre es peor que un
   * correo que dice menos.
   */
  private async nombreDe(userId: string): Promise<string | null> {
    const perfiles = await firstValueFrom(
      this.credentialsClient.send<Perfil[]>({ cmd: 'user_find_by_ids' }, { ids: [userId] }),
    ).catch(() => [] as Perfil[]);

    const nombre = [perfiles[0]?.firstName, perfiles[0]?.lastName].filter(Boolean).join(' ').trim();
    return nombre || null;
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
