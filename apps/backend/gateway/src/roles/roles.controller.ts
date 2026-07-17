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
  ForbiddenException,
  Request,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AssignRoleDto,
  CheckRoleDto,
  RevokeRoleDto,
  GrantProjectAccessDto,
  RevokeProjectAccessDto,
  CheckProjectAccessDto,
  ProjectPermission,
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

  /** Otorga un permiso sobre un proyecto a un usuario específico (Solo Admin) */
  @Post('project-access')
  @HttpCode(HttpStatus.CREATED)
  async grantProjectAccess(@Request() req: Express.Request, @Body() body: GrantProjectAccessDto) {
    await this.ensureAdmin(req.user!.userId);
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'project_access_grant' }, body),
    );
  }

  /** Revoca un permiso sobre un proyecto a un usuario específico (Solo Admin) */
  @Delete('project-access')
  @HttpCode(HttpStatus.OK)
  async revokeProjectAccess(@Request() req: Express.Request, @Body() body: RevokeProjectAccessDto) {
    await this.ensureAdmin(req.user!.userId);
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'project_access_revoke' }, body),
    );
  }

  /** Obtiene todos los accesos a proyectos de un usuario específico (Admin o el propio usuario) */
  @Get('project-access/user/:userId')
  @HttpCode(HttpStatus.OK)
  async getUserProjectAccess(@Request() req: Express.Request, @Param('userId') userId: string) {
    const requesterId = req.user!.userId;
    if (requesterId !== userId) {
      await this.ensureAdmin(requesterId);
    }
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'project_access_get_user' }, { userId }),
    );
  }

  /** Obtiene todos los usuarios con acceso a un proyecto específico (Admin o usuario con acceso) */
  @Get('project-access/project/:projectId')
  @HttpCode(HttpStatus.OK)
  async getProjectUsers(@Request() req: Express.Request, @Param('projectId') projectId: string) {
    const requesterId = req.user!.userId;
    // Check if requester is Admin
    const { hasRole: isAdmin } = await firstValueFrom(
      this.rolesClient.send({ cmd: 'role_check' }, { userId: requesterId, roleName: 'Admin' }),
    );

    if (!isAdmin) {
      // Check if requester has at least VIEW access to the project
      const { hasAccess } = await firstValueFrom(
        this.rolesClient.send(
          { cmd: 'project_access_check' },
          { userId: requesterId, projectId, permission: ProjectPermission.VIEW },
        ),
      );
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this project info');
      }
    }

    return firstValueFrom(
      this.rolesClient.send({ cmd: 'project_access_get_by_project' }, { projectId }),
    );
  }

  /** Verifica si un usuario tiene un permiso específico en un proyecto */
  @Post('project-access/check')
  @HttpCode(HttpStatus.OK)
  async checkProjectAccess(@Request() req: Express.Request, @Body() body: CheckProjectAccessDto) {
    const requesterId = req.user!.userId;
    if (requesterId !== body.userId) {
      await this.ensureAdmin(requesterId);
    }
    return firstValueFrom(
      this.rolesClient.send({ cmd: 'project_access_check' }, body),
    );
  }

  private async ensureAdmin(userId: string) {
    const { hasRole } = await firstValueFrom(
      this.rolesClient.send({ cmd: 'role_check' }, { userId, roleName: 'Admin' }),
    );
    if (!hasRole) {
      throw new ForbiddenException('Only Admins can perform this action');
    }
  }
}
