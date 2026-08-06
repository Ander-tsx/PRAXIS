import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AssignRoleDto, CheckRoleDto, GLOBAL_ROLES, RevokeRoleDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireGlobalRole } from '../common/decorators/require-global-role.decorator';
import { GlobalRolesService } from '../common/global-roles/global-roles.service';
import { AccountOwnerGuard } from '../common/guards/account-owner.guard';
import { GlobalRoleGuard } from '../common/guards/global-role.guard';

/**
 * Gestión de los roles globales del sistema.
 *
 * Rutas protegidas: `JwtGuard` en todas. Las de administración exigen además un
 * rol global mínimo, y las que tocan la cuenta de alguien comprueban que quien
 * llama esté **estrictamente por encima** — ver `assign`.
 */
@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(
    @Inject('PERMISSIONS_SERVICE') private readonly permissionsClient: ClientProxy,
    private readonly globalRoles: GlobalRolesService,
  ) {}

  /** Lista todos los roles globales del sistema */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista todos los roles globales del sistema' })
  @ApiResponse({ status: 200, description: 'Lista de roles globales recuperada' })
  findAll() {
    return firstValueFrom(this.permissionsClient.send({ cmd: 'permission_find_all_roles' }, {}));
  }

  /**
   * Asigna un rol global a un usuario.
   *
   * ## Las tres comprobaciones, y por qué no basta con la primera
   *
   * 1. `@RequireGlobalRole(ADMIN)` — la puerta: hay que ser administrador.
   * 2. `canGrant` — **el rol que se concede tiene que estar por debajo del
   *    propio**. Sin esto, crear el rol `SuperAdmin` habría abierto un agujero
   *    inmediato: esta ruta exige `Admin`, luego cualquier administrador podría
   *    haberse concedido a sí mismo el nivel de encima y saltarse todo lo demás.
   *    Efecto buscado: un `Admin` reparte `User`, un `SuperAdmin` reparte `Admin`
   *    y `User`, y **nadie concede `SuperAdmin`** — el primero lo crea el seed.
   * 3. `canActOn` — **la cuenta de destino tiene que estar por debajo de la
   *    propia**, y no puede ser la propia. Es una comprobación distinta de la
   *    anterior, no una repetición: sin ella un `Admin` podría darle el rol
   *    `User` a otro `Admin`, que no le degrada, pero el mismo hueco por el que
   *    pasa eso es el que deja tocar cuentas de igual o mayor nivel. La regla se
   *    escribe una vez y vale para las dos rutas.
   */
  @Post('assign')
  @HttpCode(HttpStatus.CREATED)
  @RequireGlobalRole(GLOBAL_ROLES.ADMIN)
  @UseGuards(GlobalRoleGuard)
  @ApiOperation({ summary: 'Asigna un rol global a un usuario (solo administradores)' })
  @ApiResponse({ status: 201, description: 'Rol asignado exitosamente' })
  @ApiResponse({ status: 403, description: 'Sin nivel suficiente sobre el rol o sobre la cuenta' })
  async assign(@Request() req: Express.Request, @Body() body: AssignRoleDto) {
    await this.exigirNivelSobre(req.user!.userId, body);

    return firstValueFrom(this.permissionsClient.send({ cmd: 'permission_assign_role' }, body));
  }

  /**
   * Revoca un rol global de un usuario.
   *
   * Las mismas tres comprobaciones que `assign`, más la del servicio: revocar el
   * último `SuperAdmin` se rechaza allí, que es donde está la tabla y donde la
   * cuenta es fiable.
   */
  @Delete('revoke')
  @HttpCode(HttpStatus.OK)
  @RequireGlobalRole(GLOBAL_ROLES.ADMIN)
  @UseGuards(GlobalRoleGuard)
  @ApiOperation({ summary: 'Revoca un rol global de un usuario (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Rol revocado exitosamente' })
  @ApiResponse({ status: 403, description: 'Sin nivel suficiente sobre el rol o sobre la cuenta' })
  @ApiResponse({ status: 409, description: 'No se puede dejar el sistema sin SuperAdmin' })
  async revoke(@Request() req: Express.Request, @Body() body: RevokeRoleDto) {
    await this.exigirNivelSobre(req.user!.userId, body);

    return firstValueFrom(this.permissionsClient.send({ cmd: 'permission_revoke_role' }, body));
  }

  /**
   * Los roles globales de un usuario. Solo los propios, o los de cualquiera si
   * eres administrador.
   *
   * ⚠️ **Estaba abierto a cualquier autenticado.** El rol global es privado por
   * decisión de producto —no se expone en el directorio de usuarios ni en la
   * lista de miembros de un proyecto— y sin este guard bastaba con conocer un
   * `userId`, que es público en cuanto compartes un proyecto, para saber quién
   * administra la plataforma. Ninguna pantalla lo hacía; la puerta estaba
   * abierta igual.
   *
   * `AccountOwnerGuard` lee `params.userId` además de `params.id` justo por esta
   * ruta.
   */
  @Get('user/:userId')
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({
    summary: 'Roles globales de un usuario (uno mismo, o cualquiera si administras)',
  })
  @ApiResponse({ status: 200, description: 'Roles del usuario recuperados' })
  @ApiResponse({ status: 403, description: 'Solo puedes consultar tus propios roles' })
  getUserRoles(@Param('userId', ParseUUIDPipe) userId: string) {
    return firstValueFrom(
      this.permissionsClient.send({ cmd: 'permission_get_user_roles' }, { userId }),
    );
  }

  /**
   * Verifica si un usuario tiene un rol global concreto.
   *
   * ⚠️ Restringido a administradores. El objetivo viaja en el **cuerpo**, así que
   * no se puede proteger comparándolo con el parámetro de la ruta como hace
   * `AccountOwnerGuard`, y tal como estaba era la misma fuga que
   * `GET user/:userId` pero por la puerta de atrás. No lo consume ninguna
   * pantalla —lo comprobé— y los guards del gateway no pasan por HTTP, así que
   * cerrarlo no rompe nada.
   *
   * ⚠️ Comprueba el **nombre exacto** y no la jerarquía: un `SuperAdmin`
   * responde `false` a `{ roleName: 'Admin' }`. Es lo correcto para una consulta
   * de estado, pero **no sirve para autorizar**. Para eso está
   * `GlobalRolesService`.
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @RequireGlobalRole(GLOBAL_ROLES.ADMIN)
  @UseGuards(GlobalRoleGuard)
  @ApiOperation({
    summary: 'Verifica si un usuario tiene un rol global exacto (solo administradores)',
  })
  @ApiResponse({ status: 200, description: 'Resultado de la verificación de rol' })
  checkRole(@Body() body: CheckRoleDto) {
    return firstValueFrom(this.permissionsClient.send({ cmd: 'permission_check_role' }, body));
  }

  /**
   * Las comprobaciones de nivel de `assign` y `revoke`, juntas para que no se
   * puedan aplicar en una ruta y olvidar en la otra.
   *
   * **El orden es el del mensaje, no el de la seguridad.** Las tres bloquean lo
   * mismo se pongan como se pongan; lo que cambia es qué se le dice a quien
   * administra, y cada motivo se arregla de una forma distinta. Van de la más
   * concreta a la más general:
   *
   * 1. **Es tu propia cuenta.** Comparar dos ids es gratis y no depende de que
   *    los niveles se hayan resuelto bien. Iba en último lugar y el resultado era
   *    un mensaje engañoso: quien intentaba quitarse su propio rol de
   *    administrador leía «ese rol está a tu nivel o por encima» —cierto, pero no
   *    es el motivo— en vez de «no puedes cambiar tus propios roles».
   * 2. **El rol está por encima de lo que puedes repartir.**
   * 3. **La cuenta está a tu nivel o por encima.**
   */
  private async exigirNivelSobre(
    actorId: string,
    body: AssignRoleDto | RevokeRoleDto,
  ): Promise<void> {
    if (actorId === body.userId) {
      throw new ForbiddenException('No puedes cambiar tus propios roles globales.');
    }

    if (!(await this.globalRoles.canGrant(actorId, body.roleName))) {
      throw new ForbiddenException(
        `No puedes gestionar el rol ${body.roleName}: está a tu nivel o por encima.`,
      );
    }

    if (!(await this.globalRoles.canActOn(actorId, body.userId))) {
      throw new ForbiddenException('Solo puedes gestionar cuentas de nivel inferior al tuyo.');
    }
  }
}
