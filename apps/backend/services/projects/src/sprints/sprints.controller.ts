import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateSprintDto,
  FindOneSprintDto,
  FindSprintsByBoardDto,
  FindSprintsByIdsDto,
  StartSprintDto,
  UpdateSprintDto,
} from '@praxis/contracts';
import { SprintsService } from './sprints.service';

@Controller()
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @MessagePattern({ cmd: 'sprint_create' })
  createSprint(@Payload() dto: CreateSprintDto) {
    return this.sprintsService.createSprint(dto);
  }

  @MessagePattern({ cmd: 'sprint_find_by_board' })
  findSprintsByBoard(@Payload() dto: FindSprintsByBoardDto) {
    return this.sprintsService.findSprintsByBoard(dto.boardId);
  }

  @MessagePattern({ cmd: 'sprint_find_one' })
  findOneSprint(@Payload() dto: FindOneSprintDto) {
    return this.sprintsService.findOneSprint(dto.id);
  }

  /** Para que tasks-service compruebe que un `sprintId` es del tablero. */
  @MessagePattern({ cmd: 'sprint_find_by_ids' })
  findSprintsByIds(@Payload() dto: FindSprintsByIdsDto) {
    return this.sprintsService.findSprintsByIds(dto.ids);
  }

  /** Para que el gateway sepa a qué sprint atar una tarea nueva (D12). */
  @MessagePattern({ cmd: 'sprint_find_active' })
  findActiveSprint(@Payload() dto: FindSprintsByBoardDto) {
    return this.sprintsService.findActiveSprint(dto.boardId);
  }

  @MessagePattern({ cmd: 'sprint_find_planned' })
  findPlannedSprint(@Payload() dto: FindSprintsByBoardDto) {
    return this.sprintsService.findPlannedSprint(dto.boardId);
  }

  @MessagePattern({ cmd: 'sprint_update' })
  updateSprint(@Payload() dto: UpdateSprintDto) {
    return this.sprintsService.updateSprint(dto);
  }

  /** Último paso de descartar un planeado; el gateway ya devolvió sus tareas al backlog. */
  @MessagePattern({ cmd: 'sprint_delete_planned' })
  deletePlannedSprint(@Payload() dto: { id: string; boardId: string }) {
    return this.sprintsService.deletePlannedSprint(dto.id, dto.boardId);
  }

  @MessagePattern({ cmd: 'sprint_start' })
  startSprint(@Payload() dto: StartSprintDto) {
    return this.sprintsService.startSprint(dto);
  }

  /** Último paso del cierre; el gateway ya reasignó las tareas pendientes (D6). */
  @MessagePattern({ cmd: 'sprint_mark_closed' })
  markSprintClosed(
    @Payload() dto: { id: string; boardId: string; summary?: Record<string, number> },
  ) {
    return this.sprintsService.markSprintClosed(dto.id, dto.boardId, dto.summary);
  }
}
