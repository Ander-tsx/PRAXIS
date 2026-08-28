import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  AssignTaskDto,
  CreateAttachmentDto,
  CreateChecklistDto,
  CreateCommentDto,
  CreateLabelDto,
  CreateTaskDto,
  DeleteAttachmentDto,
  DeleteChecklistDto,
  DeleteCommentDto,
  DeleteLabelDto,
  DeleteTaskDto,
  FindAttachmentsDto,
  FindCommentsDto,
  FindLabelsDto,
  FindMyTasksDto,
  FindOneTaskDto,
  FindTasksByProjectDto,
  FindTasksDto,
  GetAttachmentDto,
  MoveTaskDto,
  PurgeTasksDto,
  type ReportFilters,
  RestatusTasksDto,
  ToggleChecklistDto,
  UpdateCommentDto,
  UpdateLabelDto,
  UpdateTaskDto,
} from '@praxis/contracts';

import { AttachmentsService } from './attachments.service';
import { CommentsService } from './comments.service';
import { LabelsService } from './labels.service';
import { type DimensionCruce, StatsService } from './stats.service';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly labelsService: LabelsService,
    private readonly commentsService: CommentsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly statsService: StatsService,
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

  /** Tareas de todo un proyecto (útil para alexa / asistente de voz) */
  @MessagePattern({ cmd: 'task_find_by_project' })
  findByProject(@Payload() dto: FindTasksByProjectDto) {
    return this.tasksService.findTasksByProject(dto);
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
  /** Suelta a alguien de las tareas de unos proyectos. Ver `releaseAssignments`. */
  @MessagePattern({ cmd: 'task_release_assignments' })
  releaseAssignments(@Payload() dto: { userId: string; projectIds: string[] }) {
    return this.tasksService.releaseAssignments(dto);
  }

  @MessagePattern({ cmd: 'task_purge' })
  purge(@Payload() dto: PurgeTasksDto) {
    return this.tasksService.purgeTasks(dto);
  }

  /** Cascada del renombrado de una columna: el `status` guarda su nombre. */
  @MessagePattern({ cmd: 'task_restatus' })
  restatus(@Payload() dto: RestatusTasksDto) {
    return this.tasksService.restatusTasks(dto);
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

  // ─── Comentarios ──────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'comment_find_all' })
  findComments(@Payload() dto: FindCommentsDto) {
    return this.commentsService.findComments(dto);
  }

  @MessagePattern({ cmd: 'comment_create' })
  createComment(@Payload() dto: CreateCommentDto) {
    return this.commentsService.createComment(dto);
  }

  @MessagePattern({ cmd: 'comment_update' })
  updateComment(@Payload() dto: UpdateCommentDto) {
    return this.commentsService.updateComment(dto);
  }

  @MessagePattern({ cmd: 'comment_delete' })
  deleteComment(@Payload() dto: DeleteCommentDto) {
    return this.commentsService.deleteComment(dto);
  }

  // ─── Adjuntos ─────────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'attachment_find_all' })
  findAttachments(@Payload() dto: FindAttachmentsDto) {
    return this.attachmentsService.findAttachments(dto);
  }

  @MessagePattern({ cmd: 'attachment_create' })
  createAttachment(@Payload() dto: CreateAttachmentDto) {
    return this.attachmentsService.createAttachment(dto);
  }

  /** Los bytes, solo para la ruta de descarga. */
  @MessagePattern({ cmd: 'attachment_get_content' })
  getAttachmentContent(@Payload() dto: GetAttachmentDto) {
    return this.attachmentsService.getContent(dto);
  }

  @MessagePattern({ cmd: 'attachment_delete' })
  deleteAttachment(@Payload() dto: DeleteAttachmentDto) {
    return this.attachmentsService.deleteAttachment(dto);
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

  // ─── Estadísticas ─────────────────────────────────────────────────────────

  /**
   * ⚠️ **`filtros` llega ya resuelto y ya validado.** El gateway comprobó las
   * formas contra `ReportFiltersQueryDto` y que el tramo tenga sentido;
   * reports-service metió dentro la ventana en días, de modo que `from` siempre
   * viene puesto en los informes con historial. Aquí no se vuelve a mirar: es el
   * mismo trato que tiene el resto de comandos internos.
   */
  @MessagePattern({ cmd: 'task_stats_snapshot' })
  statsSnapshot(@Payload() dto: { projectId: string; filtros?: ReportFilters }) {
    return this.statsService.snapshot(dto.projectId, dto.filtros);
  }

  @MessagePattern({ cmd: 'task_stats_cycle' })
  statsCycle(@Payload() dto: { projectId: string; filtros?: ReportFilters }) {
    return this.statsService.cycleTimes(dto.projectId, dto.filtros);
  }

  @MessagePattern({ cmd: 'task_stats_flow' })
  statsFlow(@Payload() dto: { projectId: string; filtros?: ReportFilters }) {
    return this.statsService.dailyFlow(dto.projectId, dto.filtros);
  }

  @MessagePattern({ cmd: 'task_stats_people' })
  statsPeople(@Payload() dto: { projectId: string; filtros?: ReportFilters }) {
    return this.statsService.byPerson(dto.projectId, dto.filtros);
  }

  /** El inventario de tareas para el contexto del asistente. */
  @MessagePattern({ cmd: 'task_inventory' })
  taskInventory(@Payload() dto: { projectId: string }) {
    return this.statsService.inventory(dto.projectId);
  }

  /**
   * Experiencia por persona **y etiqueta**. La consume el asistente para poder
   * recomendar a alguien por lo que ha hecho, no por lo rápido que va.
   */
  @MessagePattern({ cmd: 'task_stats_experience' })
  statsExperience(@Payload() dto: { projectId: string }) {
    return this.statsService.byPersonAndLabel(dto.projectId);
  }

  /** Entradas y cierres por semana, para «¿cómo estuvo la semana?». */
  @MessagePattern({ cmd: 'task_stats_weekly' })
  statsWeekly(@Payload() dto: { projectId: string; semanas?: number; filtros?: ReportFilters }) {
    return this.statsService.weeklyThroughput(dto.projectId, dto.semanas, dto.filtros);
  }

  /**
   * Abiertas que llevan `dias` sin cambiar de columna. No hay estado
   * «bloqueada» en el modelo: se deduce del historial.
   */
  /**
   * Una fila por proyecto para la cartera. Ver `StatsService.portfolio`.
   *
   * ⚠️ `projectIds` llega **ya filtrado por `canViewReports`** desde el gateway,
   * y es la única línea de acceso de esa vista: aquí no se comprueba nada.
   */
  @MessagePattern({ cmd: 'task_stats_portfolio' })
  statsPortfolio(@Payload() dto: { projectIds: string[]; dias?: number }) {
    return this.statsService.portfolio(dto.projectIds ?? [], dto.dias);
  }

  /**
   * El cruce de dos dimensiones. Ver `StatsService.matrix`.
   *
   * ⚠️ Las dos dimensiones llegan **ya validadas** contra el conjunto cerrado
   * por el DTO del gateway; el servicio las vuelve a comprobar porque este
   * comando también es alcanzable por TCP sin pasar por él.
   */
  @MessagePattern({ cmd: 'task_stats_matrix' })
  statsMatrix(
    @Payload()
    dto: {
      projectId: string;
      agruparPor: DimensionCruce;
      partirPor: DimensionCruce;
      filtros?: ReportFilters;
    },
  ) {
    return this.statsService.matrix(dto.projectId, dto.agruparPor, dto.partirPor, dto.filtros);
  }

  /**
   * Cuánto tiempo pasa una tarea en cada columna. Ver `StatsService.columnTime`.
   */
  @MessagePattern({ cmd: 'task_stats_column_time' })
  statsColumnTime(@Payload() dto: { projectId: string; filtros?: ReportFilters }) {
    return this.statsService.columnTime(dto.projectId, dto.filtros);
  }

  /**
   * Retrabajo, rotación de responsable y volatilidad de prioridad.
   *
   * Los tres salen de `task_events` y de nada más: no se captura ningún evento
   * nuevo para esto. Ver `StatsService.dynamics`.
   */
  @MessagePattern({ cmd: 'task_stats_dynamics' })
  statsDynamics(@Payload() dto: { projectId: string; filtros?: ReportFilters }) {
    return this.statsService.dynamics(dto.projectId, dto.filtros);
  }

  @MessagePattern({ cmd: 'task_stats_stale' })
  statsStale(
    @Payload() dto: { projectId: string; dias?: number; limite?: number; filtros?: ReportFilters },
  ) {
    return this.statsService.sinMovimiento(dto.projectId, dto.dias, dto.limite, dto.filtros);
  }
}
