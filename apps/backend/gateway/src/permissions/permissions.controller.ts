import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AssignRoleDto,
  CheckRoleDto,
  RevokeRoleDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { GlobalRoleGuard } from '../common/guards/global-role.guard';
import { RequireGlobalRole } from '../common/decorators/require-global-role.decorator';

/**
 * Controller para la gestión de roles globales del sistema.
 * Rutas protegidas: JwtGuard en todas.
 * Rutas de administración (assign, revoke): además requieren rol Admin via GlobalRoleGuard.
 */
@UseGuards(JwtGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(
    @Inject('PERMISSIONS_SERVICE') private readonly permissionsClient: ClientProxy,
  ) {}

  /** Lista todos los roles globales del sistema */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll() {
    return firstValueFrom(
      this.permissionsClient.send({ cmd: 'permission_find_all_roles' }, {}),
    );
  }

  /** Asigna un rol global a un usuario (solo Admin) */
  @Post('assign')
  @HttpCode(HttpStatus.CREATED)
  @RequireGlobalRole('Admin')
  @UseGuards(GlobalRoleGuard)
  assign(@Body() body: AssignRoleDto) {
    return firstValueFrom(
      this.permissionsClient.send({ cmd: 'permission_assign_role' }, body),
    );
  }

  /** Revoca un rol global de un usuario (solo Admin) */
  @Delete('revoke')
  @HttpCode(HttpStatus.OK)
  @RequireGlobalRole('Admin')
  @UseGuards(GlobalRoleGuard)
  revoke(@Body() body: RevokeRoleDto) {
    return firstValueFrom(
      this.permissionsClient.send({ cmd: 'permission_revoke_role' }, body),
    );
  }

  /** Obtiene todos los roles globales de un usuario específico */
  @Get('user/:userId')
  getUserRoles(@Param('userId') userId: string) {
    return firstValueFrom(
      this.permissionsClient.send({ cmd: 'permission_get_user_roles' }, { userId }),
    );
  }

  /** Verifica si un usuario tiene un rol global específico */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  checkRole(@Body() body: CheckRoleDto) {
    return firstValueFrom(
      this.permissionsClient.send({ cmd: 'permission_check_role' }, body),
    );
  }
}
