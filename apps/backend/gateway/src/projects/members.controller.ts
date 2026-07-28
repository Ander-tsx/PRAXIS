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
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AddMemberDto,
  RemoveMemberDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@ApiTags('Project Members')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/members')
export class MembersController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Lista todos los miembros de un proyecto (la membresía basta) */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista todos los miembros de un proyecto' })
  @ApiResponse({ status: 200, description: 'Lista de miembros recuperada' })
  findAll(@Param('projectId') projectId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_find_all' }, { projectId }),
    );
  }

  /** Agrega un miembro a un proyecto (requiere canManageMembers) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Agrega un miembro a un proyecto' })
  @ApiResponse({ status: 201, description: 'Miembro agregado exitosamente' })
  add(
    @Param('projectId') projectId: string,
    @Body() body: Omit<AddMemberDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_add' }, { projectId, ...body }),
    );
  }

  /** Elimina un miembro de un proyecto (requiere canManageMembers) */
  @Delete()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Elimina un miembro de un proyecto' })
  @ApiResponse({ status: 200, description: 'Miembro eliminado exitosamente' })
  remove(
    @Param('projectId') projectId: string,
    @Body() body: Omit<RemoveMemberDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_remove' }, { projectId, ...body }),
    );
  }
}
