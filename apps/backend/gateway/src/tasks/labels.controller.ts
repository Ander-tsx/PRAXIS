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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { CreateLabelBodyDto, ProjectPermission, UpdateLabelBodyDto } from '@praxis/contracts';

/**
 * Etiquetas de un proyecto.
 *
 * Cuelgan del **proyecto** y no del tablero: así la misma etiqueta vale para
 * todos sus tableros, que es como se usan en la práctica.
 *
 * ⚠️ **Gestionarlas exige `canEditTask`.** No hay un permiso propio de
 * etiquetas y no vamos a inventar uno sin acordarlo: quien puede editar tareas
 * puede definir con qué se etiquetan, que es lo más cercano. Queda anotado en
 * `PENDIENTES-BACKEND.md §16` por si conviene separarlo.
 *
 * El `projectId` sale de `params`, así que el guard lo resuelve directo sin
 * pasar por ninguna tarea.
 */
@ApiTags('Labels')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/labels')
export class LabelsController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Etiquetas del proyecto' })
  @ApiResponse({ status: 200, description: 'Lista de etiquetas' })
  findAll(@Request() req: Express.Request) {
    /* `req.projectId` y no el `@Param`: la ruta admite un slug y el guard ya lo
       tradujo. Con la cadena literal, el microservicio responde 200 con una
       lista vacía en vez de un error. */
    return firstValueFrom(
      this.tasksClient.send({ cmd: 'label_find_all' }, { projectId: req.projectId }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_LABELS)
  @ApiOperation({ summary: 'Crea una etiqueta' })
  @ApiResponse({ status: 201, description: 'Etiqueta creada' })
  create(@Request() req: Express.Request, @Body() body: CreateLabelBodyDto) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'label_create' },
        { ...body, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_LABELS)
  @ApiOperation({ summary: 'Actualiza una etiqueta' })
  @ApiResponse({ status: 200, description: 'Etiqueta actualizada' })
  update(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Body() body: UpdateLabelBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'label_update' },
        { ...body, id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /** Eliminar una etiqueta la quita de todas las tareas que la llevaban. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_LABELS)
  @ApiOperation({ summary: 'Elimina una etiqueta y la quita de sus tareas' })
  @ApiResponse({ status: 200, description: 'Etiqueta eliminada' })
  delete(@Param('id') id: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'label_delete' },
        { id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }
}
