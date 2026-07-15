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

@UseGuards(JwtGuard)
@Controller('roles')
export class RolesController {
  constructor(
    @Inject('ROLES_SERVICE') private readonly rolesClient: ClientProxy,
  ) {}

  /** Lista todos los roles globales del sistema */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll() {
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'role_find_all' }, {}),
    );
  }

  /** Asigna un rol global a un usuario */
  @Post('assign')
  @HttpCode(HttpStatus.CREATED)
  assign(@Body() body: AssignRoleDto) {
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'role_assign' }, body),
    );
  }

  /** Revoca un rol global de un usuario */
  @Delete('revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Body() body: RevokeRoleDto) {
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'role_revoke' }, body),
    );
  }

  /** Obtiene todos los roles globales de un usuario específico */
  @Get('user/:userId')
  getUserRoles(@Param('userId') userId: string) {
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'role_get_user_roles' }, { userId }),
    );
  }

  /** Verifica si un usuario tiene un rol específico */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  checkRole(@Body() body: CheckRoleDto) {
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'role_check' }, body),
    );
  }
}
