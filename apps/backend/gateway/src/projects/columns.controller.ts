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
  CreateColumnDto,
  ReorderColumnsDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('boards/:boardId/columns')
export class ColumnsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Agrega una columna a un board (requiere canCreateColumn) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_CREATE_COLUMN)
  create(
    @Param('boardId') boardId: string,
    @Body() body: Omit<CreateColumnDto, 'boardId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'column_create' }, { boardId, ...body }),
    );
  }

  /** Reordena las columnas de un board (requiere canCreateColumn) */
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_CREATE_COLUMN)
  reorder(
    @Param('boardId') boardId: string,
    @Body() body: Omit<ReorderColumnsDto, 'boardId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'column_reorder' }, { boardId, ...body }),
    );
  }

  /** Elimina una columna (requiere canDeleteColumn) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_COLUMN)
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'column_delete' }, { id }),
    );
  }
}
