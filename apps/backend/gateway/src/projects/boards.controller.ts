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
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateBoardDto,
  UpdateBoardDto,
  ProjectPermission,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

// ─── Colección: boards de un workspace ─────────────────────────────────────

@ApiTags('Boards')
@ApiBearerAuth()
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
  @ApiOperation({ summary: 'Crea un board en un workspace' })
  @ApiResponse({ status: 201, description: 'Board creado exitosamente' })
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
  @ApiOperation({ summary: 'Lista todos los boards de un workspace' })
  @ApiResponse({ status: 200, description: 'Lista de boards recuperada' })
  findAll(@Param('workspaceId') workspaceId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_find_all' }, { workspaceId }),
    );
  }
}

// ─── Elemento individual ────────────────────────────────────────────────────

@ApiTags('Boards')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('boards')
export class BoardsResourceController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Detalle de un board por ID (la membresía basta) */
  @Get(':boardId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detalle de un board por ID' })
  @ApiResponse({ status: 200, description: 'Detalle del board recuperado' })
  findOne(@Param('boardId') boardId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_find_one' }, { id: boardId }),
    );
  }

  /** Actualiza un board (requiere canEditBoard) */
  @Patch(':boardId')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_BOARD)
  @ApiOperation({ summary: 'Actualiza un board' })
  @ApiResponse({ status: 200, description: 'Board actualizado exitosamente' })
  update(
    @Param('boardId') boardId: string,
    @Body() body: Omit<UpdateBoardDto, 'id'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_update' }, { id: boardId, ...body }),
    );
  }

  /** Elimina un board (requiere canDeleteBoard) */
  @Delete(':boardId')
  @RequireProjectPermission(ProjectPermission.CAN_DELETE_BOARD)
  @ApiOperation({ summary: 'Elimina un board' })
  @ApiResponse({ status: 200, description: 'Board eliminado exitosamente' })
  delete(@Param('boardId') boardId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_delete' }, { id: boardId }),
    );
  }
}
