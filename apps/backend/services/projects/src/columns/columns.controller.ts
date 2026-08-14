import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateColumnDto,
  DeleteColumnDto,
  FindColumnsByIdsDto,
  ReorderColumnsDto,
  UpdateColumnDto,
} from '@praxis/contracts';
import { ColumnsService } from './columns.service';

@Controller()
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @MessagePattern({ cmd: 'column_create' })
  createColumn(@Payload() dto: CreateColumnDto) {
    return this.columnsService.createColumn(dto);
  }

  @MessagePattern({ cmd: 'column_reorder' })
  reorderColumns(@Payload() dto: ReorderColumnsDto) {
    return this.columnsService.reorderColumns(dto);
  }

  /** Para que el gateway resuelva la columna de una tarea. */
  @MessagePattern({ cmd: 'column_find_by_ids' })
  findColumnsByIds(@Payload() dto: FindColumnsByIdsDto) {
    return this.columnsService.findColumnsByIds(dto.ids);
  }

  @MessagePattern({ cmd: 'column_update' })
  updateColumn(@Payload() dto: UpdateColumnDto) {
    return this.columnsService.updateColumn(dto);
  }

  @MessagePattern({ cmd: 'column_delete' })
  deleteColumn(@Payload() dto: DeleteColumnDto) {
    return this.columnsService.deleteColumn(dto.id);
  }
}
