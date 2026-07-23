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
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CreateBoardDto,
  UpdateBoardDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('workspaces/:workspaceId/boards')
export class BoardsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Crea un board en un workspace (requiere canCreateBoard) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_CREATE_BOARD)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Omit<CreateBoardDto, 'workspaceId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_create' }, { workspaceId, ...body }),
    );
  }

  /** Lista todos los boards de un workspace (la membresía basta) */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Param('workspaceId') workspaceId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_find_all' }, { workspaceId }),
    );
  }

  /** Actualiza un board (requiere canEditBoard) */
  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateBoardDto, 'id'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_update' }, { id, ...body }),
    );
  }

  /** Elimina un board (requiere canDeleteBoard) */
  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_BOARD)
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_delete' }, { id }),
    );
  }
}
