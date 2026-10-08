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
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateCustomFieldBodyDto,
  ProjectPermission,
  SetTaskFieldValueBodyDto,
  UpdateCustomFieldBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Campos personalizados de un proyecto (`docs/PLAN-CAMPOS-PERSONALIZADOS.md`).
 *
 * Cuelgan del **proyecto**, como las etiquetas: el mismo campo vale para todos
 * sus tableros.
 *
 * ⚠️ **Gestionarlos exige `canEditTask`** (D2): lo decidió el dueño del
 * producto. Quien edita tareas decide qué se anota en ellas; no hay un permiso
 * propio de campos.
 */
@ApiTags('Custom fields')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/fields')
export class CustomFieldsController {
  constructor(@Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Campos personalizados del proyecto, en su orden' })
  @ApiResponse({ status: 200, description: 'Lista de campos' })
  findAll(@Request() req: Express.Request) {
    /* `req.projectId` y no el `@Param`: la ruta admite un slug y el guard ya lo
       tradujo (igual que en `LabelsController`). */
    return firstValueFrom(
      this.tasksClient.send({ cmd: 'field_find_all' }, { projectId: req.projectId }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Crea un campo personalizado' })
  @ApiResponse({ status: 201, description: 'Campo creado' })
  @ApiResponse({ status: 409, description: 'Ya hay un campo con ese nombre' })
  create(@Request() req: Express.Request, @Body() body: CreateCustomFieldBodyDto) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'field_create' },
        { ...body, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({
    summary: 'Renombra un campo, cambia sus opciones, su orden o si sale en la tarjeta',
  })
  @ApiResponse({ status: 200, description: 'Campo actualizado' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: Express.Request,
    @Body() body: UpdateCustomFieldBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'field_update' },
        { ...body, id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }

  /** Borrar un campo borra su valor en todas las tareas. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Elimina un campo y sus valores en todas las tareas' })
  @ApiResponse({ status: 200, description: 'Campo eliminado' })
  delete(@Param('id', new ParseUUIDPipe()) id: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'field_delete' },
        { id, projectId: req.projectId, requesterId: req.user!.userId },
      ),
    );
  }
}

/**
 * El valor de un campo en una tarea.
 *
 * En su propio controlador porque el guard saca el proyecto de `:taskId` solo
 * en los controladores de `TASK_CONTROLLERS`, y este tiene que estar en esa
 * lista: sin ella responde 403 «Contexto de proyecto no encontrado».
 *
 * ⚠️ **No pasa por `PATCH /tasks/:id`** (D5 del plan): ese reescribe
 * encargados y etiquetas y despierta a las automatizaciones.
 */
@ApiTags('Custom fields')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('tasks/:taskId/fields')
export class TaskFieldValuesController {
  constructor(@Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy) {}

  @Put(':fieldId')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Escribe el valor de un campo en una tarea (`null` lo vacía)' })
  @ApiResponse({ status: 200, description: 'Valor guardado' })
  @ApiResponse({ status: 400, description: 'El valor no es del tipo del campo' })
  set(
    /* Sin `ParseUUIDPipe`, como el resto de rutas de tarea: hay tareas con ids
       que no son UUID (las del seed, `task0001-…`) y el guard ya respondió si
       la tarea no existe. */
    @Param('taskId') taskId: string,
    @Param('fieldId', new ParseUUIDPipe()) fieldId: string,
    @Request() req: Express.Request,
    @Body() body: SetTaskFieldValueBodyDto,
  ) {
    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'field_set_value' },
        {
          value: body.value ?? null,
          taskId,
          fieldId,
          projectId: req.projectId,
          requesterId: req.user!.userId,
        },
      ),
    );
  }
}
