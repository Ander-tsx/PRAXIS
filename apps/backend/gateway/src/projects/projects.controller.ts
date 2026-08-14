import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateProjectBodyDto,
  FindProjectsQueryDto,
  ProjectPermission,
  UpdateProjectBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { TaskPurgeService } from './task-purge.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly taskPurge: TaskPurgeService,
  ) {}

  /** Crea un nuevo proyecto (el ownerId viene del token) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crea un nuevo proyecto' })
  @ApiResponse({ status: 201, description: 'Proyecto creado exitosamente' })
  @ApiResponse({ status: 409, description: 'Ya existe un proyecto con ese nombre' })
  create(@Request() req: Express.Request, @Body() body: CreateProjectBodyDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_create' },
        {
          ...body,
          ownerId: req.user!.userId,
        },
      ),
    );
  }

  /** Lista proyectos del usuario autenticado */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista proyectos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Lista de proyectos recuperada' })
  findAll(@Request() req: Express.Request, @Query() query: FindProjectsQueryDto) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_find_all' },
        query.toFindProjectsDto(req.user!.userId),
      ),
    );
  }

  /** Detalle de un proyecto. Basta con poder verlo. */
  @Get(':id')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Detalle de un proyecto' })
  @ApiResponse({ status: 200, description: 'Detalle del proyecto recuperado' })
  findOne(@Request() req: Express.Request) {
    /* `req.projectId` y no el parámetro: la ruta acepta también el slug, y el
       guard ya lo tradujo al UUID real. Leerlo del `@Param` volvería a mandar
       «rediseno-del-panel» al microservicio, que solo entiende ids. */
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_find_one' }, { id: req.projectId! }),
    );
  }

  /**
   * Actualiza el nombre y la descripción de un proyecto.
   *
   * Exige `canEditProject`. Pedía `canEditBoard`, el permiso de otra cosa: es la
   * misma familia de rarezas que `canMoveTask`, `canComment` y
   * `canDeleteProject`, y se cierra igual — el permiso nuevo entra implicado por
   * el que se usaba antes, así que ningún rol existente pierde capacidad.
   */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_PROJECT)
  @ApiOperation({ summary: 'Actualiza un proyecto' })
  @ApiResponse({ status: 200, description: 'Proyecto actualizado exitosamente' })
  update(@Request() req: Express.Request, @Body() body: UpdateProjectBodyDto) {
    const id = req.projectId!;
    // El id va después del spread: uno colado en el cuerpo no debe pisar la ruta.
    return firstValueFrom(this.projectsClient.send({ cmd: 'project_update' }, { ...body, id }));
  }

  /** Elimina un proyecto (requiere poder eliminar boards) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_PROJECT)
  @ApiOperation({ summary: 'Elimina un proyecto' })
  @ApiResponse({ status: 200, description: 'Proyecto eliminado exitosamente' })
  async delete(@Request() req: Express.Request) {
    const id = req.projectId!;
    const result = await firstValueFrom(
      this.projectsClient.send({ cmd: 'project_delete' }, { id }),
    );
    // Las tareas viven en otro microservicio: el cascade no llega hasta ellas.
    await this.taskPurge.afterProjectDeleted(id);
    return result;
  }
}
