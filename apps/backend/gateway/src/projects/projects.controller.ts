import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
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
  CreateProjectBodyDto,
  FindProjectsQueryDto,
  ProjectPermission,
  UpdateProjectBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { TaskPurgeService } from './task-purge.service';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

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
      this.projectsClient.send({ cmd: 'project_create' }, {
        ...body,
        ownerId: req.user!.userId,
      }),
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
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_find_one' }, { id }),
    );
  }

  /** Actualiza un proyecto (requiere poder editar boards) */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  @ApiOperation({ summary: 'Actualiza un proyecto' })
  @ApiResponse({ status: 200, description: 'Proyecto actualizado exitosamente' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectBodyDto,
  ) {
    // El id va después del spread: uno colado en el cuerpo no debe pisar la ruta.
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'project_update' }, { ...body, id }),
    );
  }

  /** Elimina un proyecto (requiere poder eliminar boards) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_BOARD)
  @ApiOperation({ summary: 'Elimina un proyecto' })
  @ApiResponse({ status: 200, description: 'Proyecto eliminado exitosamente' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    const result = await firstValueFrom(
      this.projectsClient.send({ cmd: 'project_delete' }, { id }),
    );
    // Las tareas viven en otro microservicio: el cascade no llega hasta ellas.
    await this.taskPurge.afterProjectDeleted(id);
    return result;
  }
}
