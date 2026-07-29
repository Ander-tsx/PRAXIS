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
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateColumnBodyDto,
  ProjectPermission,
  ReorderColumnsBodyDto,
  UpdateColumnBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ColumnStatusSyncService } from './column-status-sync.service';
import { TaskPurgeService } from './task-purge.service';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@ApiTags('Columns')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('boards/:boardId/columns')
export class ColumnsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    private readonly columnStatusSync: ColumnStatusSyncService,
    private readonly taskPurge: TaskPurgeService,
  ) {}

  /** Agrega una columna a un board (requiere canCreateColumn) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_CREATE_COLUMN)
  @ApiOperation({ summary: 'Agrega una columna a un board' })
  @ApiResponse({ status: 201, description: 'Columna agregada exitosamente' })
  create(
    @Param('boardId') boardId: string,
    @Body() body: CreateColumnBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'column_create' }, { boardId, ...body }),
    );
  }

  /** Reordena las columnas de un board (requiere canCreateColumn) */
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_CREATE_COLUMN)
  @ApiOperation({ summary: 'Reordena las columnas de un board' })
  @ApiResponse({ status: 200, description: 'Columnas reordenadas exitosamente' })
  reorder(
    @Param('boardId') boardId: string,
    @Body() body: ReorderColumnsBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'column_reorder' }, { boardId, ...body }),
    );
  }

  /**
   * Renombra una columna o le cambia el color (requiere canEditColumn).
   *
   * Va **después** de `reorder`: Nest resuelve las rutas en orden de
   * declaración, y `:id` de primero se comería `PATCH .../columns/reorder`
   * tratando «reorder» como un id.
   *
   * ⚠️ Renombrar arrastra el `status` de las tareas de la columna, porque ese
   * campo guarda el nombre y no el id. La cascada la hace `ColumnStatusSyncService`
   * después de que projects-service confirme el cambio: el nombre que se
   * propaga es el que devolvió el servicio, no el que pidió el cliente.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_COLUMN)
  @ApiOperation({ summary: 'Renombra una columna o le cambia el color' })
  @ApiResponse({ status: 200, description: 'Columna actualizada exitosamente' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateColumnBodyDto,
  ) {
    const updated = await firstValueFrom(
      this.projectsClient.send({ cmd: 'column_update' }, { id, ...body }),
    );

    // Solo si el nombre entraba en el cambio: un cambio de color no toca el
    // `status` de nada y la llamada sería trabajo tirado.
    if (body.name !== undefined && updated?.name) {
      await this.columnStatusSync.afterColumnRenamed(id, updated.name);
    }

    return updated;
  }

  /**
   * Elimina una columna y las tareas que tenía dentro (requiere canDeleteColumn).
   *
   * Las tareas viven en otro microservicio: el cascade de Postgres no cruza esa
   * frontera y sin esta limpieza se quedaban vivas apuntando a una columna que
   * ya no existe — sin pintarse en ningún tablero y contando en «mis tareas».
   */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_COLUMN)
  @ApiOperation({ summary: 'Elimina una columna y sus tareas' })
  @ApiResponse({ status: 200, description: 'Columna eliminada exitosamente' })
  async delete(@Param('id') id: string) {
    const result = await firstValueFrom(
      this.projectsClient.send({ cmd: 'column_delete' }, { id }),
    );
    await this.taskPurge.afterColumnDeleted(id);
    return result;
  }
}
