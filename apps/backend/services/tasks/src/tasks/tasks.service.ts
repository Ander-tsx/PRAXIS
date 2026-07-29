import { Injectable } from '@nestjs/common';
import { ClientProxy, ClientProxyFactory, RpcException, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { Prisma } from '../generated/prisma-client';
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

/**
 * Lo que acompaña a una tarea al salir del servicio.
 *
 * En un solo sitio para que las cinco rutas que devuelven tareas tengan la
 * misma forma: cuando cada una traía su propio `include`, la del listado no
 * llevaba encargados y la del detalle sí, y la interfaz tenía que saber de
 * dónde venía cada tarea.
 */
const TASK_INCLUDE = {
  subtasks:   { include: { checklists: { orderBy: { order: 'asc' } } } },
  checklists: { orderBy: { order: 'asc' } },
  assignees:  { orderBy: { assignedAt: 'asc' } },
} satisfies Prisma.TaskInclude;

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

  /**
   * Comprueba que todos los encargados pertenezcan al proyecto, y devuelve la
   * lista sin repetidos.
   *
   * Sin esto se puede asignar una tarea a un UUID cualquiera: el guardado
   * funciona, y la interfaz acaba enseñando a alguien que no existe o que no
   * está en el proyecto. Cuesta una consulta a projects-service, que ya cachea
   * la lista de miembros.
   *
   * El dueño entra aunque no aparezca como miembro: los proyectos creados antes
   * de `477616f` no tienen fila de `ProjectMember` para él.
   */
  private async resolveAssignees(projectId: string, userIds: string[]): Promise<string[]> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return [];

    const [members, project] = await Promise.all([
      firstValueFrom(this.projectsClient.send({ cmd: 'member_find_all' }, { projectId })),
      firstValueFrom(this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId })),
    ]);

    const allowed = new Set<string>((members ?? []).map((m: any) => m.userId));
    if (project?.ownerId) allowed.add(project.ownerId);

    const outsiders = unique.filter((id) => !allowed.has(id));
    if (outsiders.length > 0) {
      throw new RpcException({
        statusCode: 400,
        message:
          outsiders.length === 1
            ? 'Esa persona no es miembro del proyecto'
            : `${outsiders.length} de los encargados no son miembros del proyecto`,
      });
    }

    return unique;
  }

  /**
   * Deja los encargados de una tarea exactamente en `userIds`.
   *
   * Borra y vuelve a insertar en vez de calcular el diferencial: la lista es de
   * unos pocos elementos y así el resultado no depende del estado previo.
   */
  private async replaceAssignees(
    tx: Prisma.TransactionClient,
    taskId: string,
    userIds: string[],
    assignedBy: string,
  ) {
    await tx.taskAssignee.deleteMany({ where: { taskId } });
    if (userIds.length > 0) {
      await tx.taskAssignee.createMany({
        data: userIds.map((userId) => ({ taskId, userId, assignedBy })),
      });
    }
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  async createTask(dto: CreateTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canCreateTask');

    const assignees = await this.resolveAssignees(dto.projectId, dto.assigneeIds ?? []);

    const task = await this.prisma.task.create({
      data: {
        title:        dto.title,
        description:  dto.description,
        status:       dto.status,
        boardId:      dto.boardId,
        columnId:     dto.columnId,
        reporterId:   dto.requesterId,
        projectId:    dto.projectId,
        parentTaskId: dto.parentTaskId,
        dueDate:      dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority:     dto.priority,
        order:        dto.order ?? 0,
        assignees: {
          create: assignees.map((userId) => ({ userId, assignedBy: dto.requesterId })),
        },
      },
      include: TASK_INCLUDE,
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
        include: TASK_INCLUDE,
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
      include: TASK_INCLUDE,
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

    // Se validan antes de abrir la transacción: si alguien no es del proyecto,
    // no se ha tocado nada todavía.
    const assignees =
      dto.assigneeIds !== undefined
        ? await this.resolveAssignees(dto.projectId, dto.assigneeIds)
        : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (assignees !== undefined) {
        await this.replaceAssignees(tx, dto.id, assignees, dto.requesterId);
      }

      return tx.task.update({
        where: { id: dto.id },
        data: {
          ...(dto.title       !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.status      !== undefined && { status: dto.status }),
          ...(dto.columnId    !== undefined && { columnId: dto.columnId }),
          ...(dto.priority    !== undefined && { priority: dto.priority }),
          // `null` limpia la fecha; sin esto no habría forma de quitarla.
          ...(dto.dueDate     !== undefined && {
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          }),
        },
        include: TASK_INCLUDE,
      });
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
      include: TASK_INCLUDE,
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

  /**
   * Deja los encargados de la tarea exactamente en `assigneeIds`.
   *
   * Sustituye, no acumula: la lista que llega es la lista que queda. Un array
   * vacío desasigna a todo el mundo.
   */
  async assignTask(dto: AssignTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');

    const task = await this.loadTaskInProject(dto.id, dto.projectId);
    const assignees = await this.resolveAssignees(dto.projectId, dto.assigneeIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.replaceAssignees(tx, dto.id, assignees, dto.requesterId);
      return tx.task.findUniqueOrThrow({ where: { id: dto.id }, include: TASK_INCLUDE });
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
