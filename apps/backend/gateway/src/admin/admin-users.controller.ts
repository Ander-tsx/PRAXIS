import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminActionType,
  AdminTargetType,
  FindAdminUsersQueryDto,
  GLOBAL_ROLES,
  type GlobalRole,
  SetUserRoleBodyDto,
  SetUserStatusBodyDto,
  UserStatus,
  globalRoleLevel,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireGlobalRole } from '../common/decorators/require-global-role.decorator';
import { GlobalRolesService } from '../common/global-roles/global-roles.service';
import { GlobalRoleGuard } from '../common/guards/global-role.guard';
import { AdminActivityRecorder } from './admin-activity.recorder';

/** Lo que devuelve credentials en un listado. */
interface UsuarioCrudo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  createdAt: string;
  credential?: { email?: string | null } | null;
}

/** Qué acción del registro corresponde a cada estado nuevo. */
const ACCION_POR_ESTADO: Record<UserStatus, AdminActionType> = {
  [UserStatus.ACTIVE]: AdminActionType.USER_REACTIVATED,
  [UserStatus.SUSPENDED]: AdminActionType.USER_SUSPENDED,
  [UserStatus.INACTIVE]: AdminActionType.USER_DEACTIVATED,
};

/**
 * Administración de cuentas: listar, suspender, reactivar y fijar el rol global.
 *
 * ## Lo que NO hay aquí, y por qué
 *
 * **No hay borrado de usuarios.** Existe `DELETE /users/:id` para que cada quien
 * cierre su propia cuenta, pero el panel no lo ofrece: borrar una cuenta deja
 * tareas, comentarios e historial apuntando a alguien que ya no está, y esos
 * datos viven en otros microservicios donde la cascada no llega. Suspender cubre
 * el caso real —esta persona no debe poder entrar— y se deshace.
 *
 * ## Las cuatro invariantes, y dónde se comprueba cada una
 *
 * 1. **Nadie actúa sobre su propia cuenta.** Aquí, comparando ids: es la
 *    comprobación más barata y la que da el mensaje concreto.
 * 2. **Solo hacia abajo.** Aquí, con `canActOn`: nivel estrictamente superior.
 *    Vale para las dos rutas — bloquear solo el cambio de rol dejaba la
 *    suspensión como vía para el mismo daño.
 * 3. **El rol que se reparte tiene que estar por debajo del propio.** Aquí, con
 *    `canGrant`. Un `Admin` reparte `User`; solo un `SuperAdmin` reparte `Admin`;
 *    nadie reparte `SuperAdmin`.
 * 4. **Nunca cero SuperAdmins.** Aquí para el mensaje, y en permissions-service
 *    para impedirlo de verdad, que es donde está la tabla.
 *
 * ⚠️ Con la invariante 2 puesta, la 4 es **hoy inalcanzable por HTTP**: para
 * suspender o degradar a un SuperAdmin habría que superarlo, y nadie lo supera.
 * Se implementa igual, porque es la que sostiene el sistema si algún día se
 * permite que un SuperAdmin actúe sobre sus iguales — y porque una invariante que
 * solo existe en la cabeza de quien escribió el guard no es una invariante.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@RequireGlobalRole(GLOBAL_ROLES.ADMIN)
@UseGuards(JwtGuard, GlobalRoleGuard)
@Controller('admin/users')
export class AdminUsersController {
  private readonly logger = new Logger(AdminUsersController.name);

  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    @Inject('PERMISSIONS_SERVICE') private readonly permissionsClient: ClientProxy,
    @Inject('ALEXA_SERVICE') private readonly alexaClient: ClientProxy,
    private readonly globalRoles: GlobalRolesService,
    private readonly actividad: AdminActivityRecorder,
  ) {}

  /**
   * El listado del panel: cuentas con su estado y su rol global.
   *
   * Es una ruta aparte de `GET /users` porque aquel es el **directorio** que usa
   * cualquiera para invitar gente a un proyecto, y ahí ni el estado ni el rol
   * global se enseñan — el rol global es privado por decisión de producto. Este
   * los enseña, y por eso está detrás del rol de administrador.
   *
   * Los roles salen de otro servicio, así que se cruzan aquí. En **una** llamada
   * para toda la página (`permission_get_roles_for_users`) y no una por fila.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cuentas con su estado y su rol global (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Listado recuperado: { items, total }' })
  async findAll(@Query() query: FindAdminUsersQueryDto) {
    const { items, total } = await firstValueFrom(
      this.credentialsClient.send<{ items: UsuarioCrudo[]; total: number }>(
        { cmd: 'user_find_all' },
        {
          query: { page: query.page ?? 1, limit: query.limit ?? 25 },
          filters: {
            ...(query.search ? { search: query.search } : {}),
            ...(query.status ? { status: query.status } : {}),
          },
        },
      ),
    );

    const roles = await this.rolesDe(items.map((u) => u.id));

    return {
      items: items.map((usuario) => ({
        ...usuario,
        /* Sin filas es `User`: `POST /auth/register` no asigna ningún rol, así
           que la mayoría de las cuentas reales no tienen ninguna. Resolverlo aquí
           evita que cada pantalla tenga que saberlo. */
        globalRole: (roles[usuario.id] ?? [])[0] ?? GLOBAL_ROLES.USER,
        globalRoles: roles[usuario.id] ?? [],
      })),
      total,
    };
  }

  /**
   * Suspender, reactivar o desactivar una cuenta.
   *
   * El motivo es **obligatorio** para todo lo que no sea reactivar. Una cuenta
   * bloqueada sin motivo es una cuenta que nadie sabe explicar: ni la persona
   * afectada, que solo ve «credenciales inválidas», ni el siguiente
   * administrador que mire el registro.
   *
   * Al dejar de estar activa se le cierran **las dos** sesiones: la web
   * (`auth:session:<id>` en credentials) y las de voz (`alexa_link_revoke`). La
   * segunda es la que faltaba y la que más duraba: el token de voz vive 90 días,
   * y `verifyToken` solo comprobaba que el perfil existiera.
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambia el estado de una cuenta (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 400, description: 'Falta el motivo al suspender o desactivar' })
  @ApiResponse({
    status: 403,
    description: 'Sobre tu propia cuenta, o sobre una de nivel igual o superior',
  })
  @ApiResponse({ status: 409, description: 'Dejaría el sistema sin SuperAdmin' })
  async setStatus(
    @Request() req: Express.Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetUserStatusBodyDto,
  ) {
    const actorId = req.user!.userId;

    /* La regla no cabe en un decorador porque depende del valor de otro campo. */
    if (body.status !== UserStatus.ACTIVE && !body.reason?.trim()) {
      throw new BadRequestException('Hace falta un motivo para suspender o desactivar una cuenta.');
    }

    await this.exigirMando(actorId, id);
    if (body.status !== UserStatus.ACTIVE) {
      await this.exigirQueNoSeaElUltimoSuperAdmin(id);
    }

    const actualizado = await firstValueFrom(
      this.credentialsClient.send<UsuarioCrudo>(
        { cmd: 'user_set_status' },
        { id, status: body.status },
      ),
    );

    if (body.status !== UserStatus.ACTIVE) {
      await this.revocarSesionesDeVoz(id, body.status);
    }

    await this.actividad.record({
      actorId,
      actorLabel: await this.etiquetaDe(actorId),
      action: ACCION_POR_ESTADO[body.status],
      targetType: AdminTargetType.USER,
      targetId: id,
      targetLabel: etiqueta(actualizado),
      reason: body.reason,
      metadata: { status: body.status },
    });

    return actualizado;
  }

  /**
   * Fija el rol global de una cuenta.
   *
   * `PUT` porque **reemplaza**: el nivel efectivo es el más alto de las filas de
   * una cuenta, así que añadir `User` a un `Admin` no lo degradaría. El panel
   * enseña un rol, y así lo que se ve es lo que hay.
   */
  @Put(':id/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fija el rol global de una cuenta (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Rol fijado' })
  @ApiResponse({
    status: 403,
    description: 'Sobre tu propia cuenta, sobre un igual, o un rol que no puedes repartir',
  })
  @ApiResponse({ status: 409, description: 'Dejaría el sistema sin SuperAdmin' })
  async setRole(
    @Request() req: Express.Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetUserRoleBodyDto,
  ) {
    const actorId = req.user!.userId;

    await this.exigirMando(actorId, id);

    if (!(await this.globalRoles.canGrant(actorId, body.role))) {
      throw new ForbiddenException(
        `No puedes asignar el rol ${body.role}: está a tu nivel o por encima.`,
      );
    }

    if (body.role !== GLOBAL_ROLES.SUPER_ADMIN) {
      await this.exigirQueNoSeaElUltimoSuperAdmin(id);
    }

    const anteriores = await this.globalRoles.rolesOf(id);

    await firstValueFrom(
      this.permissionsClient.send(
        { cmd: 'permission_set_user_role' },
        { userId: id, roleName: body.role },
      ),
    );

    const nivelAnterior = globalRoleLevel(anteriores);
    const subeDeNivel = globalRoleLevel([body.role]) > nivelAnterior;

    await this.actividad.record({
      actorId,
      actorLabel: await this.etiquetaDe(actorId),
      /* Conceder o revocar según si el nivel sube o baja. Un registro que dijera
         «ROLE_CHANGED» obligaría a comparar los dos valores para saber si fue un
         ascenso o una degradación, que es lo primero que se quiere saber. */
      action: subeDeNivel ? AdminActionType.ROLE_GRANTED : AdminActionType.ROLE_REVOKED,
      targetType: AdminTargetType.USER,
      targetId: id,
      targetLabel: await this.etiquetaDe(id),
      reason: body.reason,
      metadata: { role: body.role, previousRoles: anteriores },
    });

    return { userId: id, globalRole: body.role };
  }

  /* ─── Invariantes ──────────────────────────────────────────────────── */

  /**
   * Nadie sobre su propia cuenta, y solo hacia abajo.
   *
   * Las dos juntas para que no se puedan aplicar en una ruta y olvidar en la
   * otra, que es como la suspensión se habría quedado sin la regla de niveles.
   */
  private async exigirMando(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) {
      throw new ForbiddenException('No puedes administrar tu propia cuenta desde el panel.');
    }

    if (!(await this.globalRoles.canActOn(actorId, targetId))) {
      throw new ForbiddenException('Solo puedes administrar cuentas de nivel inferior al tuyo.');
    }
  }

  /**
   * Que la cuenta no sea el último SuperAdmin.
   *
   * Se comprueba antes de intentarlo para dar un mensaje que se entienda;
   * permissions-service lo vuelve a comprobar y es quien de verdad lo impide,
   * porque allí la cuenta no puede estar desactualizada.
   */
  private async exigirQueNoSeaElUltimoSuperAdmin(targetId: string): Promise<void> {
    const { count, userIds } = await firstValueFrom(
      this.permissionsClient.send<{ count: number; userIds: string[] }>(
        { cmd: 'permission_count_role_holders' },
        { roleName: GLOBAL_ROLES.SUPER_ADMIN },
      ),
    );

    if (count <= 1 && userIds.includes(targetId)) {
      throw new ConflictException(
        'Es el último SuperAdmin: el sistema se quedaría sin quien administre a los administradores.',
      );
    }
  }

  /* ─── Auxiliares ───────────────────────────────────────────────────── */

  private async rolesDe(userIds: string[]): Promise<Record<string, string[]>> {
    if (userIds.length === 0) return {};
    try {
      return await firstValueFrom(
        this.permissionsClient.send<Record<string, string[]>>(
          { cmd: 'permission_get_roles_for_users' },
          { userIds },
        ),
      );
    } catch (error) {
      /* Un listado sin la columna del rol sigue sirviendo para buscar y para
         suspender; tumbar la pantalla entera por eso, no. */
      this.logger.warn(
        `No se pudieron resolver los roles del listado: ${(error as Error).message}`,
      );
      return {};
    }
  }

  /**
   * Las sesiones de voz, revocadas.
   *
   * `alexa_link_revoke` sin `linkId` revoca todas las de esa persona. El fallo no
   * corta la suspensión —la cuenta ya está suspendida y `verifyToken` comprueba
   * el estado por su cuenta— pero se registra, porque es la diferencia entre que
   * el token deje de valer ahora o en la siguiente frase.
   */
  private async revocarSesionesDeVoz(userId: string, status: UserStatus): Promise<void> {
    try {
      await firstValueFrom(
        this.alexaClient.send(
          { cmd: 'alexa_link_revoke' },
          { userId, reason: `account_${status.toLowerCase()}` },
        ),
      );
    } catch (error) {
      this.logger.warn(
        `No se pudieron revocar las sesiones de voz de ${userId}: ${(error as Error).message}. ` +
          'El token dejará de valer en la siguiente consulta, que ya comprueba el estado.',
      );
    }
  }

  /**
   * Nombre o correo, para la copia que guarda el registro.
   *
   * Degrada al id si credentials no responde: una entrada con el id es peor de
   * leer, pero perder la entrada entera por no poder adornarla sería absurdo.
   */
  private async etiquetaDe(userId: string): Promise<string> {
    try {
      const usuario = await firstValueFrom(
        this.credentialsClient.send<UsuarioCrudo>({ cmd: 'user_find_one' }, { id: userId }),
      );
      return etiqueta(usuario);
    } catch {
      return userId;
    }
  }
}

/** `Nombre Apellido`, o el correo si la cuenta aún no tiene nombre. */
function etiqueta(usuario: UsuarioCrudo | null | undefined): string {
  if (!usuario) return '';
  const nombre = [usuario.firstName, usuario.lastName]
    .map((parte) => parte?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  return nombre || usuario.credential?.email || usuario.id;
}
