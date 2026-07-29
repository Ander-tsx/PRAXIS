import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateColumnDto,
  ReorderColumnsDto,
  DeleteColumnDto,
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

  @MessagePattern({ cmd: 'column_update' })
  updateColumn(@Payload() dto: UpdateColumnDto) {
    return this.columnsService.updateColumn(dto);
  }

  @MessagePattern({ cmd: 'column_delete' })
  deleteColumn(@Payload() dto: DeleteColumnDto) {
    return this.columnsService.deleteColumn(dto.id);
  }
}
