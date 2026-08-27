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
import { QuotaService } from '../billing/quota.service';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { AutomationPurgeService } from './automation-purge.service';
import { TaskPurgeService } from './task-purge.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly taskPurge: TaskPurgeService,
    private readonly automationPurge: AutomationPurgeService,
    private readonly quota: QuotaService,
  ) {}

  /**
   * Crea un nuevo proyecto (el ownerId viene del token).
   *
   * ⚠️ **El tope del plan se comprueba aquí, antes de escribir**, y responde
   * **402** con `QUOTA_EXCEEDED` — no 403. Un 403 se arregla pidiéndole permiso
   * a alguien; esto se arregla borrando un proyecto o ampliando el plan, y
   * ofrecer «pídeselo a quien administra» a quien administra es la peor ayuda
   * posible. La pantalla apaga el botón antes; quien decide es esto.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crea un nuevo proyecto' })
  @ApiResponse({ status: 201, description: 'Proyecto creado exitosamente' })
  @ApiResponse({ status: 402, description: 'Tu plan no da para otro proyecto' })
  @ApiResponse({ status: 409, description: 'Ya existe un proyecto con ese nombre' })
  async create(@Request() req: Express.Request, @Body() body: CreateProjectBodyDto) {
    /* El orden importa y no es intercambiable: primero **dónde** va el proyecto
       —con las dos comprobaciones de pertenencia y permiso— y solo después si
       cabe. Contar antes de saber en qué organización se cuenta daría el tope de
       la personal a quien está creando en la de su empresa. */
    const organizationId = await this.quota.resolverOrganizacionParaProyecto({
      userId: req.user!.userId,
      organizationId: body.organizationId,
    });

    await this.quota.exigirProyecto(req.user!.userId, organizationId);

    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_create' },
        {
          ...body,
          ownerId: req.user!.userId,
          organizationId,
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
    await Promise.all([
      this.taskPurge.afterProjectDeleted(id),
      this.automationPurge.afterProjectDeleted(id),
    ]);
    return result;
  }
}
