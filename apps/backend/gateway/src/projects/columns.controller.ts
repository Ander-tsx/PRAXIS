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
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

@UseGuards(JwtGuard)
@Controller('boards/:boardId/columns')
export class ColumnsController {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** Agrega una columna a un board */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('boardId') boardId: string,
    @Body() body: Omit<CreateColumnDto, 'boardId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'column_create' }, { boardId, ...body }),
    );
  }

  /** Reordena las columnas de un board */
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  reorder(
    @Param('boardId') boardId: string,
    @Body() body: Omit<ReorderColumnsDto, 'boardId'>,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'column_reorder' }, { boardId, ...body }),
    );
  }

  /** Elimina una columna */
  @Delete(':id')
  delete(@Param('id') id: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'column_delete' }, { id }),
    );
  }
}
