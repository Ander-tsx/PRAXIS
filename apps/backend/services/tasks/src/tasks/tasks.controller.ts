import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  AssignTaskDto,
  CreateChecklistDto,
  CreateLabelDto,
  CreateTaskDto,
  DeleteChecklistDto,
  DeleteLabelDto,
  DeleteTaskDto,
  FindLabelsDto,
  UpdateLabelDto,
  FindMyTasksDto,
  FindOneTaskDto,
  FindTasksDto,
  MoveTaskDto,
  PurgeTasksDto,
  ToggleChecklistDto,
  UpdateTaskDto,
} from '@praxis/contracts';

import { LabelsService } from './labels.service';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly labelsService: LabelsService,
  ) {}

  // ─── Tasks ────────────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'task_create' })
  create(@Payload() dto: CreateTaskDto) {
    return this.tasksService.createTask(dto);
  }

  @MessagePattern({ cmd: 'task_find_all' })
  findAll(@Payload() dto: FindTasksDto) {
    return this.tasksService.findAllTasks(dto);
  }

  @MessagePattern({ cmd: 'task_find_one' })
  findOne(@Payload() dto: FindOneTaskDto) {
    return this.tasksService.findOneTask(dto);
  }

  /** Tareas asignadas a una persona, para el panel. */
  @MessagePattern({ cmd: 'task_find_mine' })
  findMine(@Payload() dto: FindMyTasksDto) {
    return this.tasksService.findMyTasks(dto);
  }

  @MessagePattern({ cmd: 'task_update' })
  update(@Payload() dto: UpdateTaskDto) {
    return this.tasksService.updateTask(dto);
  }

  @MessagePattern({ cmd: 'task_move' })
  move(@Payload() dto: MoveTaskDto) {
    return this.tasksService.moveTask(dto);
  }

  @MessagePattern({ cmd: 'task_delete' })
  delete(@Payload() dto: DeleteTaskDto) {
    return this.tasksService.deleteTask(dto);
  }

  @MessagePattern({ cmd: 'task_assign' })
  assign(@Payload() dto: AssignTaskDto) {
    return this.tasksService.assignTask(dto);
  }

  /** Limpieza al borrar un proyecto, un espacio o un tablero. */
  @MessagePattern({ cmd: 'task_purge' })
  purge(@Payload() dto: PurgeTasksDto) {
    return this.tasksService.purgeTasks(dto);
  }

  // ─── Etiquetas ────────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'label_find_all' })
  findLabels(@Payload() dto: FindLabelsDto) {
    return this.labelsService.findLabels(dto);
  }

  @MessagePattern({ cmd: 'label_create' })
  createLabel(@Payload() dto: CreateLabelDto) {
    return this.labelsService.createLabel(dto);
  }

  @MessagePattern({ cmd: 'label_update' })
  updateLabel(@Payload() dto: UpdateLabelDto) {
    return this.labelsService.updateLabel(dto);
  }

  @MessagePattern({ cmd: 'label_delete' })
  deleteLabel(@Payload() dto: DeleteLabelDto) {
    return this.labelsService.deleteLabel(dto);
  }

  // ─── Subtasks ─────────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'subtask_create' })
  createSubtask(@Payload() dto: CreateTaskDto) {
    return this.tasksService.createSubtask(dto);
  }

  // ─── Checklists ───────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'checklist_create' })
  createChecklist(@Payload() dto: CreateChecklistDto) {
    return this.tasksService.createChecklist(dto);
  }

  @MessagePattern({ cmd: 'checklist_toggle' })
  toggleChecklist(@Payload() dto: ToggleChecklistDto) {
    return this.tasksService.toggleChecklist(dto);
  }

  @MessagePattern({ cmd: 'checklist_delete' })
  deleteChecklist(@Payload() dto: DeleteChecklistDto) {
    return this.tasksService.deleteChecklist(dto);
  }
}
