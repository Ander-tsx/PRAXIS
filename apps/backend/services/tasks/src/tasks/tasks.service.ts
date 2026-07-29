import { Injectable } from '@nestjs/common';
import { ClientProxy, ClientProxyFactory, RpcException, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  AssignTaskDto,
  CreateChecklistDto,
  CreateTaskDto,
  DeleteChecklistDto,
  DeleteTaskDto,
  FindOneTaskDto,
  FindTasksDto,
  MoveTaskDto,
  ToggleChecklistDto,
  UpdateTaskDto,
} from '@praxis/contracts';

const TASK_CACHE_TTL = 120;       // 2 min individual task
const BOARD_TASKS_TTL = 60;       // 1 min board tasks list

@Injectable()
export class TasksService {
  private readonly projectsClient: ClientProxy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.projectsClient = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: {
        host: this.config.get<string>('PROJECTS_SERVICE_HOST', 'localhost'),
        port: this.config.get<number>('PROJECTS_SERVICE_PORT', 3003),
      },
    });
  }

  // ─── Permission guard ─────────────────────────────────────────────────────

  private async assertPermission(
    requesterId: string,
    projectId: string,
    permission: string,
  ): Promise<void> {
    const result = await firstValueFrom(
      this.projectsClient.send(
        { cmd: 'project_check_permission' },
        { userId: requesterId, projectId, permission },
      ),
    );

    // projects-service devuelve { allowed: boolean } o true (temp)
    const allowed = typeof result === 'boolean' ? result : result?.allowed;
    if (!allowed) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
  }

  /**
   * Carga una tarea y comprueba que pertenece al proyecto que dice el payload.
   *
   * El gateway ya resuelve el `projectId` desde la ruta, así que esto no
   * debería fallar nunca desde la API pública. Está porque el microservicio no
   * puede confiar en quien lo llame: sin esta comprobación, un `projectId`
   * distinto del real convertía el permiso sobre *un* proyecto en permiso
   * sobre las tareas de *cualquiera* (`PENDIENTES-BACKEND.md §9`).
   */
  private async loadTaskInProject(taskId: string, projectId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new RpcException({ statusCode: 404, message: 'Tarea no encontrada' });
    }
    if (task.projectId !== projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    return task;
  }

  /**
   * Carga un ítem de checklist con su tarea y comprueba el proyecto.
   *
   * El ítem no guarda `projectId`, así que la comprobación pasa por la tarea.
   */
  private async loadChecklistInProject(itemId: string, projectId: string) {
    const item = await this.prisma.checklist.findUnique({
      where: { id: itemId },
      include: { task: true },
    });
    if (!item) {
      throw new RpcException({ statusCode: 404, message: 'Ítem de checklist no encontrado' });
    }
    if (item.task.projectId !== projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    return item;
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  async createTask(dto: CreateTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canCreateTask');

    const task = await this.prisma.task.create({
      data: {
        title:        dto.title,
        description:  dto.description,
        status:       dto.status,
        boardId:      dto.boardId,
        columnId:     dto.columnId,
        assigneeId:   dto.assigneeId,
        reporterId:   dto.requesterId,
        projectId:    dto.projectId,
        parentTaskId: dto.parentTaskId,
        dueDate:      dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority:     dto.priority,
        order:        dto.order ?? 0,
      },
      include: { subtasks: true, checklists: true },
    });

    await this.redis.del(`tasks:board:${dto.boardId}`);
    return task;
  }

  async findAllTasks(dto: FindTasksDto) {
    const cacheKey = `tasks:board:${dto.boardId}${dto.columnId ? `:col:${dto.columnId}` : ''}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const page  = dto.query?.page  ?? 1;
    const limit = dto.query?.limit ?? 50;
    const skip  = (page - 1) * limit;

    const where: any = { boardId: dto.boardId };
    if (dto.columnId) where.columnId = dto.columnId;

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: {
          subtasks: { include: { checklists: true } },
          checklists: { orderBy: { order: 'asc' } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    const result = { items, total };
    await this.redis.set(cacheKey, result, BOARD_TASKS_TTL);
    return result;
  }

  async findOneTask(dto: FindOneTaskDto) {
    const cacheKey = `task:${dto.id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const task = await this.prisma.task.findUnique({
      where: { id: dto.id },
      include: {
        subtasks: { include: { checklists: { orderBy: { order: 'asc' } } } },
        checklists: { orderBy: { order: 'asc' } },
      },
    });

    if (!task) {
      throw new RpcException({ statusCode: 404, message: 'Tarea no encontrada' });
    }

    await this.redis.set(cacheKey, task, TASK_CACHE_TTL);
    return task;
  }

  async updateTask(dto: UpdateTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');

    const task = await this.loadTaskInProject(dto.id, dto.projectId);

    const updated = await this.prisma.task.update({
      where: { id: dto.id },
      data: {
        ...(dto.title       !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status      !== undefined && { status: dto.status }),
        ...(dto.columnId    !== undefined && { columnId: dto.columnId }),
        ...(dto.assigneeId  !== undefined && { assigneeId: dto.assigneeId }),
        ...(dto.priority    !== undefined && { priority: dto.priority }),
        ...(dto.dueDate     !== undefined && { dueDate: new Date(dto.dueDate) }),
      },
      include: { subtasks: true, checklists: true },
    });

    await Promise.all([
      this.redis.del(`task:${dto.id}`),
      this.redis.del(`tasks:board:${task.boardId}`),
    ]);

    return updated;
  }

  async moveTask(dto: MoveTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');

    const task = await this.loadTaskInProject(dto.id, dto.projectId);

    const updated = await this.prisma.task.update({
      where: { id: dto.id },
      data: {
        columnId: dto.columnId,
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.order  !== undefined && { order: dto.order }),
      },
      include: { subtasks: true, checklists: true },
    });

    await Promise.all([
      this.redis.del(`task:${dto.id}`),
      this.redis.del(`tasks:board:${task.boardId}`),
    ]);

    return updated;
  }

  async deleteTask(dto: DeleteTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canDeleteTask');

    const task = await this.loadTaskInProject(dto.id, dto.projectId);

    await this.prisma.task.delete({ where: { id: dto.id } });

    await Promise.all([
      this.redis.del(`task:${dto.id}`),
      this.redis.del(`tasks:board:${task.boardId}`),
    ]);

    return { success: true };
  }

  async assignTask(dto: AssignTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');

    const task = await this.loadTaskInProject(dto.id, dto.projectId);

    const updated = await this.prisma.task.update({
      where: { id: dto.id },
      data: { assigneeId: dto.assigneeId ?? null },
      include: { subtasks: true, checklists: true },
    });

    await Promise.all([
      this.redis.del(`task:${dto.id}`),
      this.redis.del(`tasks:board:${task.boardId}`),
    ]);

    return updated;
  }

  // ─── Subtasks ─────────────────────────────────────────────────────────────

  async createSubtask(dto: CreateTaskDto) {
    if (!dto.parentTaskId) {
      throw new RpcException({ statusCode: 400, message: 'Se requiere parentTaskId para crear una subtarea' });
    }

    // La madre tiene que ser del mismo proyecto: si no, una subtarea sería una
    // vía para colgar trabajo de un proyecto ajeno.
    await this.loadTaskInProject(dto.parentTaskId, dto.projectId);

    // Delegate to createTask — permission included
    return this.createTask(dto);
  }

  // ─── Checklists ───────────────────────────────────────────────────────────

  async createChecklist(dto: CreateChecklistDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');

    const task = await this.loadTaskInProject(dto.taskId, dto.projectId);

    const item = await this.prisma.checklist.create({
      data: {
        taskId: dto.taskId,
        text:   dto.text,
        order:  dto.order ?? 0,
      },
    });

    await Promise.all([
      this.redis.del(`task:${dto.taskId}`),
      this.redis.del(`tasks:board:${task.boardId}`),
    ]);

    return item;
  }

  async toggleChecklist(dto: ToggleChecklistDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');

    const item = await this.loadChecklistInProject(dto.id, dto.projectId);

    const updated = await this.prisma.checklist.update({
      where: { id: dto.id },
      data: { completed: !item.completed },
    });

    // También la lista del tablero: la tarjeta enseña el avance del checklist,
    // y sin esto se queda con el recuento viejo hasta que caduque (trampa #3).
    await Promise.all([
      this.redis.del(`task:${item.taskId}`),
      this.redis.del(`tasks:board:${item.task.boardId}`),
    ]);

    return updated;
  }

  async deleteChecklist(dto: DeleteChecklistDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');

    const item = await this.loadChecklistInProject(dto.id, dto.projectId);

    await this.prisma.checklist.delete({ where: { id: dto.id } });

    await Promise.all([
      this.redis.del(`task:${item.taskId}`),
      this.redis.del(`tasks:board:${item.task.boardId}`),
    ]);

    return { success: true };
  }
}
