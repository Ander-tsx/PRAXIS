import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CreateProjectRoleDto,
  UpdateProjectRoleDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

@UseGuards(JwtGuard)
@Controller('projects/:projectId/roles')
export class ProjectRolesController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Crea un rol local dentro de un proyecto */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId') projectId: string,
    @Body() body: Omit<CreateProjectRoleDto, 'projectId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_create' }, { projectId, ...body }),
    );
  }

  /** Actualiza un rol local (permisos, nombre) */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateProjectRoleDto, 'id'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_update' }, { id, ...body }),
    );
  }

  /** Elimina un rol local del proyecto */
  @Delete(':id')
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_role_delete' }, { id }),
    );
  }
}
