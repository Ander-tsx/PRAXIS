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
  AddMemberDto,
  RemoveMemberDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/members')
export class MembersController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Lista todos los miembros de un proyecto */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.VIEW)
  findAll(@Param('projectId') projectId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_find_all' }, { projectId }),
    );
  }

  /** Agrega un miembro a un proyecto */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.EDIT)
  add(
    @Param('projectId') projectId: string,
    @Body() body: Omit<AddMemberDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_add' }, { projectId, ...body }),
    );
  }

  /** Elimina un miembro de un proyecto */
  @Delete()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.EDIT)
  remove(
    @Param('projectId') projectId: string,
    @Body() body: Omit<RemoveMemberDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'member_remove' }, { projectId, ...body }),
    );
  }
}
