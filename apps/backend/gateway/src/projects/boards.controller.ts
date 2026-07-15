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
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

@UseGuards(JwtGuard)
@Controller('workspaces/:workspaceId/boards')
export class BoardsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Crea un board en un workspace */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: Omit<CreateBoardDto, 'workspaceId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_create' }, { workspaceId, ...body }),
    );
  }

  /** Lista todos los boards de un workspace */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Param('workspaceId') workspaceId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_find_all' }, { workspaceId }),
    );
  }

  /** Actualiza un board */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateBoardDto, 'id'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_update' }, { id, ...body }),
    );
  }

  /** Elimina un board */
  @Delete(':id')
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'board_delete' }, { id }),
    );
  }
}
