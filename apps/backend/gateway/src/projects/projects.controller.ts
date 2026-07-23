import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CreateProjectDto,
  FindProjectsDto,
  UpdateProjectDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Crea un nuevo proyecto (el ownerId viene del token) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: Express.Request, @Body() body: Omit<CreateProjectDto, 'ownerId'>) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_create' }, {
        ...body,
        ownerId: req.user!.userId,
      }),
    );
  }

  /** Lista proyectos del usuario autenticado */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Request() req: Express.Request, @Body() body: Omit<FindProjectsDto, 'userId'>) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_find_all' }, {
        ...body,
        userId: req.user!.userId,
      }),
    );
  }

  /** Detalle de un proyecto (requiere ser miembro con cualquier rol) */
  @Get(':id')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_find_one' }, { id }),
    );
  }

  /** Actualiza un proyecto (requiere poder editar boards) */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  update(@Param('id') id: string, @Body() body: Omit<UpdateProjectDto, 'id'>) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_update' }, { id, ...body }),
    );
  }

  /** Elimina un proyecto (requiere poder eliminar boards) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_BOARD)
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_delete' }, { id }),
    );
  }
}
