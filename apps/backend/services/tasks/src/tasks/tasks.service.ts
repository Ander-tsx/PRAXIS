import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { TaskDomainOutboxFactory } from '../domain-events/task-domain-outbox.factory';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  AssignTaskDto,
  CreateChecklistDto,
  CreateTaskDto,
  DeleteChecklistDto,
  DeleteTaskDto,
  FindMyTasksDto,
  FindOneTaskDto,
  FindTasksByProjectDto,
  FindTasksDto,
  MoveTaskDto,
  NotificationType,
  PurgeTasksDto,
  RestatusTasksDto,
  ToggleChecklistDto,
  UpdateTaskDto,
} from '@praxis/contracts';
import { opcionesDeCliente } from '@praxis/local-transport';

const TASK_CACHE_TTL = 120; // 2 min individual task
const BOARD_TASKS_TTL = 60; // 1 min board tasks list
const PROJECT_TASKS_TTL = 60; // 1 min project tasks list

/**
 * Un evento a registrar, sin los campos que se repiten en todos.
 *
 * `taskId`, `projectId`, `boardId`, `actorId` y `taskTitle` los pone
 * `recordEvents` a partir de la tarea, para que ningún sitio de llamada pueda
 * olvidarse de uno.
 */
type TaskEventDraft = {
  type: Prisma.TaskEventCreateManyInput['type'];
  fromColumnId?: string | null;
  toColumnId?: string | null;
  fromPriority?: Prisma.TaskEventCreateManyInput['fromPriority'];
  toPriority?: Prisma.TaskEventCreateManyInput['toPriority'];
  subjectId?: string | null;
};

/**
 * Lo que acompaña a una tarea al salir del servicio.
 *
 * En un solo sitio para que las cinco rutas que devuelven tareas tengan la
 * misma forma: cuando cada una traía su propio `include`, la del listado no
 * llevaba encargados y la del detalle sí, y la interfaz tenía que saber de
 * dónde venía cada tarea.
 */
const TASK_INCLUDE = {
  subtasks: { include: { checklists: { orderBy: { order: 'asc' } } } },
  checklists: { orderBy: { order: 'asc' } },
  assignees: { orderBy: { assignedAt: 'asc' } },
  /* La etiqueta entera, no solo su id: la tarjeta necesita nombre y color y no
     tiene de dónde sacarlos si solo llega la relación. */
  labels: { include: { label: true } },
  /**
   * Los valores de los campos personalizados, solo los que tienen algo: sin
   * fila es vacío. La definición del campo **no** viaja aquí —nombre, tipo y
   * opciones se piden una vez por proyecto (`/projects/:id/fields`)—; repetirla
   * en cada tarea del tablero sería pagarla cincuenta veces.
   */
  fieldValues: {
    select: { fieldId: true, text: true, number: true, date: true, bool: true, ids: true },
  },
  /**
   * Los comentarios viajan **con la tarea**, también en el listado del tablero.
   *
   * Es la decisión menos elegante de este include y se toma a sabiendas: la
   * alternativa era pedirlos aparte al abrir el diálogo, y entonces las
   * Server Actions que revalidan la página no los refrescarían —habría que
   * mantener a mano un segundo camino de datos solo para ellos.
   *
   * El coste es real pero acotado: el listado ya viene con `limit`, y una
   * tarea con cien comentarios es rara. Si algún día pesa, el sitio por donde
   * cortar es este: sacarlos de aquí, dejar solo `_count`, y pedirlos al abrir.
   */
  comments: { orderBy: { createdAt: 'asc' } },
  /**
   * Adjuntos: **solo los metadatos**.
   *
   * El `select` explícito no es cosmético. Los bytes viven en `AttachmentBlob`,
   * y esta es la línea que garantiza que nadie los arrastre por accidente al
   * pedir una tarea: aquí no hay forma de nombrarlos.
   */
  attachments: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      taskId: true,
      filename: true,
      mimeType: true,
      size: true,
      uploadedBy: true,
      createdAt: true,
    },
  },
  /**
   * Los documentos vinculados: **solo el id**, para la marca de la tarjeta.
   *
   * El título vive en projects-service y aquí no se conoce; la pantalla lo
   * cruza con los documentos del proyecto, que ya tiene. Sin esto, saber si una
   * tarea lleva documentos costaba una petición por tarjeta.
   */
  documents: { orderBy: { createdAt: 'asc' }, select: { documentId: true } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  private readonly projectsClient: ClientProxy;
  private readonly domainOutbox = new TaskDomainOutboxFactory();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.projectsClient = ClientProxyFactory.create(opcionesDeCliente('PROJECTS', this.config));
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
   * Registra lo que le pasó a una tarea.
   *
   * ⚠️ **Recibe siempre el cliente de la transacción, nunca `this.prisma`.** El
   * evento y la mutación que describe tienen que caer o entrar juntos.
   *
   * Es la decisión **contraria** a la de los avisos, que son best-effort a
   * propósito (§22.2), y la diferencia importa: un aviso perdido se nota —falta
   * en la bandeja— y no rompe nada. Un movimiento no registrado no se nota
   * nunca, corrompe en silencio todos los tiempos de ciclo que se calculen
   * después, y no hay forma de detectarlo ni de repararlo, porque el dato que
   * faltaría es precisamente el que diría que falta. Aquí la escritura es local
   * —misma base, mismo esquema, sin salto de red—, así que la transacción es
   * barata; los avisos cruzan a otro microservicio y por eso no pueden serlo.
   *
   * Los campos comunes salen de la tarea y no de quien llama: así ningún sitio
   * puede olvidarse del `projectId` o mandar un `taskTitle` desincronizado.
   */
  private async recordEvents(
    tx: Prisma.TransactionClient,
    task: { id: string; projectId: string; boardId: string; title: string },
    actorId: string,
    events: TaskEventDraft[],
  ) {
    if (events.length === 0) return;

    await tx.taskEvent.createMany({
      data: events.map((event) => ({
        taskId: task.id,
        projectId: task.projectId,
        boardId: task.boardId,
        actorId,
        // Copia del momento: el evento sobrevive a la tarea.
        taskTitle: task.title,
        ...event,
      })),
    });
  }

  /**
   * Quién entra y quién sale de los encargados, como eventos.
   *
   * Mismo cálculo que hace `notifyAssigneeChanges` para avisar, pero aquí no se
   * puede reutilizar: aquel avisa **después** de la transacción y por RPC, y
   * esto tiene que ocurrir **dentro**.
   *
   * `after` sin definir significa que el `PATCH` no tocó los encargados —que no
   * es lo mismo que haberlos dejado vacíos—, así que no hay nada que registrar.
   */
  private assigneeEvents(before: string[], after?: string[]): TaskEventDraft[] {
    if (after === undefined) return [];

    const antes = new Set(before);
    const despues = new Set(after);

    return [
      ...after
        .filter((userId) => !antes.has(userId))
        .map((userId): TaskEventDraft => ({ type: 'ASSIGNED', subjectId: userId })),
      ...before
        .filter((userId) => !despues.has(userId))
        .map((userId): TaskEventDraft => ({ type: 'UNASSIGNED', subjectId: userId })),
    ];
  }

  /** Una lista es un conjunto: el orden del selector no constituye un cambio. */
  private assigneesChanged(before: string[], after?: string[]): boolean {
    if (after === undefined) return false;
    const previous = new Set(before);
    const next = new Set(after);
    return previous.size !== next.size || [...previous].some((userId) => !next.has(userId));
  }

  /**
   * Qué eventos genera un cambio de columna, y qué pasa con `completedAt`.
   *
   * Vive aparte porque **las dos rutas que mueven una tarea comparten esta
   * lógica**: `POST /tasks/:id/move` y el `PATCH` que también acepta `columnId`.
   * Duplicarla garantizaba que una de las dos se quedara atrás.
   *
   * `isClosingColumn` llega del gateway (ver `MoveTaskDto`). Si llega
   * `undefined` —el gateway no pudo resolver el color— **no se toca
   * `completedAt`**: registrar un cierre falso ensucia el throughput para
   * siempre, y no registrarlo solo lo deja incompleto.
   */
  private resolveColumnChange(params: {
    fromColumnId: string;
    toColumnId: string;
    wasCompleted: boolean;
    isClosingColumn?: boolean;
  }): { events: TaskEventDraft[]; completedAt?: Date | null } {
    const { fromColumnId, toColumnId, wasCompleted, isClosingColumn } = params;

    if (fromColumnId === toColumnId) return { events: [] };

    const events: TaskEventDraft[] = [{ type: 'MOVED', fromColumnId, toColumnId }];

    if (isClosingColumn === undefined) return { events };

    if (isClosingColumn && !wasCompleted) {
      events.push({ type: 'COMPLETED', fromColumnId, toColumnId });
      return { events, completedAt: new Date() };
    }

    if (!isClosingColumn && wasCompleted) {
      events.push({ type: 'REOPENED', fromColumnId, toColumnId });
      return { events, completedAt: null };
    }

    // De una columna de cierre a otra: sigue cerrada, y la fecha es la primera.
    return { events };
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
   * Comprueba que la columna destino sea **de este tablero**.
   *
   * `columnId` viaja en el cuerpo y solo se valida como UUID: ni el DTO ni el
   * guard lo atan al tablero de la tarea, porque el guard resuelve el proyecto
   * desde la ruta de la *tarea* y la columna vive en otro microservicio. Sin
   * esta comprobación, las tres rutas que escriben `columnId` —crear, mover y el
   * `PATCH`, que también mueve— aceptan la columna de **cualquier** tablero, el
   * de otro proyecto incluido.
   *
   * ⚠️ **Lo que rompe no es la puerta, es la tarea.** No hay escalada: sigue
   * haciendo falta permiso sobre el proyecto de la tarea. Lo que queda es una
   * fila incoherente, y de las que no se arreglan solas:
   *
   * - La tarea **sigue saliendo** en `GET /boards/:id/tasks` —ese listado filtra
   *   por `boardId`, que no cambió— pero su `columnId` no es de ninguna columna
   *   del tablero, así que no se pinta en ninguna: desaparece del tablero sin
   *   dejar de existir, y no se puede arrastrar lo que no se ve.
   * - `restatusTasks` busca por `columnId`, así que renombrar esa columna ajena
   *   reescribe el `status` de una tarea de otro proyecto.
   * - Los informes agrupan por columna. Una tarea en una columna de otro tablero
   *   no cuenta en el flujo de ninguno de los dos.
   *
   * Cuesta una consulta a projects-service en la ruta de arrastrar, que es la
   * más caliente. Se paga a sabiendas: es el mismo precio que ya pagan
   * `resolveAssignees` y `resolveLabels` unas líneas más abajo, y a cambio se
   * cierra una corrupción que desde la interfaz no tiene reparación.
   */
  private async assertColumnInBoard(boardId: string, columnId: string): Promise<void> {
    const columns = await firstValueFrom(
      this.projectsClient.send<Array<{ id: string; boardId: string }>>(
        { cmd: 'column_find_by_ids' },
        { ids: [columnId] },
      ),
    );

    const column = (columns ?? [])[0];
    if (!column) {
      throw new RpcException({ statusCode: 404, message: 'La columna destino no existe' });
    }
    if (column.boardId !== boardId) {
      throw new RpcException({
        statusCode: 400,
        message: 'Esa columna no es de este tablero',
      });
    }
  }

  /**
   * Comprueba que un sprint exista y sea del tablero que dice el payload.
   *
   * Mismo motivo que `assertColumnInBoard`: `sprintId` lo elige el cliente
   * (`CreateTaskBodyDto`, `UpdateTaskBodyDto`), y sin esto un sprint de otro
   * tablero —o de otro proyecto— podría colarse en el burndown de uno ajeno.
   */
  private async assertSprintInBoard(boardId: string, sprintId: string): Promise<void> {
    const sprint = await this.sprintDe(sprintId);
    if (!sprint) {
      throw new RpcException({ statusCode: 404, message: 'El sprint no existe' });
    }
    if (sprint.boardId !== boardId) {
      throw new RpcException({
        statusCode: 400,
        message: 'Ese sprint no es de este tablero',
      });
    }
    /* Un sprint cerrado es historial: meterle una tarea cambia su velocidad
       después de cerrarlo (auditoría S3 de `docs/PLAN-SCRUM-KANBAN.md`). */
    if (sprint.status === 'CLOSED') {
      throw new RpcException({
        statusCode: 409,
        message: 'Ese sprint ya está cerrado: no admite tareas nuevas',
      });
    }
  }

  private async sprintDe(
    sprintId: string,
  ): Promise<{ id: string; boardId: string; status: string } | null> {
    const sprints = await firstValueFrom(
      this.projectsClient.send<Array<{ id: string; boardId: string; status: string }>>(
        { cmd: 'sprint_find_by_ids' },
        { ids: [sprintId] },
      ),
    );
    return (sprints ?? [])[0] ?? null;
  }

  /**
   * Una tarea de un sprint cerrado no sale de él (S3): lo que se hizo en ese
   * sprint es lo que cuenta su velocidad, y moverla después la reescribe.
   */
  private async assertNoSaleDeUnSprintCerrado(sprintIdActual: string | null): Promise<void> {
    if (!sprintIdActual) return;
    const actual = await this.sprintDe(sprintIdActual);
    if (actual?.status === 'CLOSED') {
      throw new RpcException({
        statusCode: 409,
        message: 'Esta tarea es de un sprint cerrado: forma parte de su historial',
      });
    }
  }

  /**
   * Comprueba que todas las etiquetas existan y sean del proyecto.
   *
   * Sin esto se puede colgar de una tarea la etiqueta de otro proyecto: la
   * clave foránea solo exige que la etiqueta exista, no que sea de aquí.
   */
  private async resolveLabels(projectId: string, labelIds: string[]): Promise<string[]> {
    const unique = [...new Set(labelIds)];
    if (unique.length === 0) return [];

    const found = await this.prisma.label.findMany({
      where: { id: { in: unique }, projectId },
      select: { id: true },
    });

    if (found.length !== unique.length) {
      throw new RpcException({
        statusCode: 400,
        message: 'Alguna etiqueta no existe o no es de este proyecto',
      });
    }

    return unique;
  }

  /** Deja las etiquetas de una tarea exactamente en `labelIds`. */
  private async replaceLabels(tx: Prisma.TransactionClient, taskId: string, labelIds: string[]) {
    await tx.taskLabel.deleteMany({ where: { taskId } });
    if (labelIds.length > 0) {
      await tx.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId, labelId })) });
    }
  }

  /**
   * Deja los encargados de una tarea exactamente en `userIds`.
   *
   * Borra y vuelve a insertar en vez de calcular el diferencial: la lista es de
   * unos pocos elementos y así el resultado no depende del estado previo.
   */
  /** Los encargados que tiene ahora mismo. Se lee antes de sustituirlos. */
  private async currentAssignees(taskId: string): Promise<string[]> {
    const rows = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

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

  /**
   * Avisa a quien entra y a quien sale de una tarea.
   *
   * Lo emite **tasks-service**, aunque la tabla viva en projects-service, porque
   * aquí es donde se sabe el **cambio**: quién estaba antes y quién queda
   * después. El gateway tendría que pedir la tarea antes de tocarla solo para
   * poder comparar. Y no añade dependencia: este servicio ya llama a projects en
   * cada comprobación de permiso.
   *
   * Es **best-effort**. Si projects no responde, la asignación ya ocurrió;
   * devolver un error diría que falló algo que sí pasó, y quedarse sin aviso es
   * mucho menos grave que quedarse sin asignar.
   */
  private async notifyAssigneeChanges(params: {
    taskId: string;
    taskTitle: string;
    projectId: string;
    actorId: string;
    before: string[];
    after: string[];
  }) {
    const before = new Set(params.before);
    const after = new Set(params.after);

    const added = params.after.filter((userId) => !before.has(userId));
    const removed = params.before.filter((userId) => !after.has(userId));
    if (added.length === 0 && removed.length === 0) return;

    // El nombre del proyecto se guarda como copia en el aviso; projects-service
    // lo tiene cacheado, así que es barato.
    let projectName: string | undefined;
    try {
      const project = await firstValueFrom(
        this.projectsClient.send({ cmd: 'project_find_one' }, { id: params.projectId }),
      );
      projectName = project?.name;
    } catch {
      // Sin nombre el aviso se lee igual: dice la tarea, que es lo que importa.
    }

    const notifications = [
      ...added.map((userId) => ({ userId, type: NotificationType.TASK_ASSIGNED })),
      ...removed.map((userId) => ({ userId, type: NotificationType.TASK_UNASSIGNED })),
    ].map((base) => ({
      ...base,
      actorId: params.actorId,
      projectId: params.projectId,
      projectName,
      taskId: params.taskId,
      taskTitle: params.taskTitle,
    }));

    try {
      await firstValueFrom(
        this.projectsClient.send({ cmd: 'notification_create' }, { notifications }),
      );
    } catch {
      // Ver la nota de arriba: el trabajo ya está hecho.
    }
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  async createTask(dto: CreateTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canCreateTask');

    /* El tablero lo pone la ruta, pero la columna la elige el cuerpo: una tarea
       puede nacer ya fuera de sitio si no se comprueba que sean del mismo sitio. */
    await this.assertColumnInBoard(dto.boardId, dto.columnId);
    if (dto.sprintId) await this.assertSprintInBoard(dto.boardId, dto.sprintId);

    const assignees = await this.resolveAssignees(dto.projectId, dto.assigneeIds ?? []);
    const labels = await this.resolveLabels(dto.projectId, dto.labelIds ?? []);

    /* En transacción con su historial: una tarea que nace sin evento `CREATED`
       no tiene principio, y su tiempo de entrega es incalculable para siempre. */
    const correlationId = randomUUID();
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          status: dto.status,
          boardId: dto.boardId,
          columnId: dto.columnId,
          reporterId: dto.requesterId,
          projectId: dto.projectId,
          parentTaskId: dto.parentTaskId,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          priority: dto.priority,
          order: dto.order ?? 0,
          sprintId: dto.sprintId ?? null,
          sprintAssignedAt: dto.sprintId ? new Date() : null,
          estimatePoints: dto.estimatePoints ?? null,
          assignees: {
            create: assignees.map((userId) => ({ userId, assignedBy: dto.requesterId })),
          },
          labels: {
            create: labels.map((labelId) => ({ labelId })),
          },
        },
        include: TASK_INCLUDE,
      });

      await this.recordEvents(tx, created, dto.requesterId, [
        { type: 'CREATED', toColumnId: created.columnId, toPriority: created.priority },
        /* Los encargados iniciales cuentan como asignación: si no, una tarea
           que nace con dueño no tendría registro de cuándo lo ganó. */
        ...assignees.map((userId): TaskEventDraft => ({ type: 'ASSIGNED', subjectId: userId })),
      ]);
      await this.domainOutbox.persist(
        tx,
        {
          projectId: created.projectId,
          taskId: created.id,
          actor: { type: 'USER', id: dto.requesterId },
          correlationId,
        },
        {
          type: 'task.created.v1',
          payload: { taskId: created.id, boardId: created.boardId, columnId: created.columnId },
        },
      );

      return created;
    });

    await this.redis.delByPrefix(`tasks:board:${dto.boardId}`);

    await this.notifyAssigneeChanges({
      taskId: task.id,
      taskTitle: task.title,
      projectId: dto.projectId,
      actorId: dto.requesterId,
      before: [],
      after: assignees,
    });

    return task;
  }

  async findAllTasks(dto: FindTasksDto) {
    const page = dto.query?.page ?? 1;
    const limit = dto.query?.limit ?? 50;
    const skip = (page - 1) * limit;

    /* 🔴 **La página y el tope van en la clave.** No iban: la primera petición
       fijaba la respuesta para todas las demás durante el minuto de caché. La
       página 2 de un tablero devolvía la 1, las menciones del chat (tope 100)
       recibían las 50 del tablero, y descartar un sprint —que pide 10 000 para
       devolverlas todas al backlog— podía dejar tareas atadas a un sprint que
       ya no existe. Siguen bajo el prefijo `tasks:board:<id>`, así que el
       `delByPrefix` de siempre las invalida (trampa 26 de CLAUDE.md). */
    const cacheKey =
      `tasks:board:${dto.boardId}` +
      (dto.columnId ? `:col:${dto.columnId}` : '') +
      (dto.sprintId ? `:sprint:${dto.sprintId}` : '') +
      (dto.onlyBacklog ? ':backlog' : '') +
      `:p${page}:l${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const where: any = { boardId: dto.boardId };
    if (dto.columnId) where.columnId = dto.columnId;
    if (dto.sprintId) where.sprintId = dto.sprintId;
    /* El backlog es lo que falta por hacer: una tarea terminada sin sprint
       —las que ya estaban en Done al encender Scrum— no es trabajo pendiente
       (auditoría S6). */
    if (dto.onlyBacklog) {
      where.sprintId = null;
      where.completedAt = null;
    }

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

  /**
   * Tareas de un sprint sin `completedAt`: lo que hay que resolver antes de
   * cerrarlo (D6 de `docs/PLAN-SCRUM-KANBAN.md`).
   *
   * "Pendiente" es "no está en una columna de cierre", que es exactamente lo
   * que `completedAt` ya registra — no se inventa otro criterio.
   *
   * Sin caché: se pide una vez al abrir el diálogo de cierre y otra al
   * confirmar, y la segunda tiene que ver lo que haya cambiado entre medias.
   */
  async pendingInSprint(boardId: string, sprintId: string) {
    return this.prisma.task.findMany({
      where: { boardId, sprintId, completedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, columnId: true, status: true, priority: true },
    });
  }

  /**
   * Tareas y puntos, totales y hechos, de cada sprint pedido.
   *
   * `estimadas` dice cuántas tienen puntos: con cero, los puntos no significan
   * nada y quien lo lea tiene que hablar en tareas (mismo criterio que el
   * burndown de la pantalla).
   */
  async sprintSummary(sprintIds: string[]) {
    if (sprintIds.length === 0) return [];
    const tareas = await this.prisma.task.findMany({
      where: { sprintId: { in: sprintIds } },
      select: { sprintId: true, completedAt: true, estimatePoints: true },
    });
    return sprintIds.map((sprintId) => {
      const suyas = tareas.filter((t) => t.sprintId === sprintId);
      const hechas = suyas.filter((t) => t.completedAt !== null);
      const puntos = (lista: typeof suyas) =>
        lista.reduce((suma, t) => suma + (t.estimatePoints ?? 0), 0);
      return {
        sprintId,
        tareas: suyas.length,
        hechas: hechas.length,
        estimadas: suyas.filter((t) => t.estimatePoints !== null).length,
        puntos: puntos(suyas),
        puntosHechos: puntos(hechas),
      };
    });
  }

  /**
   * Mueve un lote de tareas de un sprint a otro, o al backlog.
   *
   * ⚠️ **El `where` exige que sigan en `fromSprintId` y en este tablero.** Un
   * id de otro tablero, o una tarea que alguien ya sacó del sprint entre que se
   * abrió el diálogo y se confirmó, simplemente no se toca: el recuento que se
   * devuelve dice cuántas se movieron de verdad.
   */
  async reassignSprint(dto: {
    boardId: string;
    fromSprintId: string | null;
    taskIds: string[];
    toSprintId: string | null;
    /** El cierre las pasa al siguiente sin terminar: se suma `carryOverCount`. */
    carry?: boolean;
  }) {
    if (dto.taskIds.length === 0) return { count: 0 };
    if (dto.toSprintId) await this.assertSprintInBoard(dto.boardId, dto.toSprintId);

    const { count } = await this.prisma.task.updateMany({
      where: { id: { in: dto.taskIds }, boardId: dto.boardId, sprintId: dto.fromSprintId },
      data: {
        sprintId: dto.toSprintId,
        sprintAssignedAt: dto.toSprintId ? new Date() : null,
        ...(dto.carry && { carryOverCount: { increment: 1 } }),
      },
    });

    await Promise.all([
      this.redis.delByPrefix(`tasks:board:${dto.boardId}`),
      ...dto.taskIds.map((id) => this.redis.del(`task:${id}`)),
    ]);

    return { count };
  }

  /**
   * Lo mínimo de cada tarea de unos sprints para dibujar el burndown y la
   * velocidad: sin relaciones, sin tope.
   *
   * La pantalla los calculaba sobre las cien primeras tareas del tablero, y
   * un tablero Scrum acumula historial por diseño: pasado el centenar, las
   * cifras se recortaban sin avisar (auditoría S2).
   */
  async sprintMetricRows(sprintIds: string[]) {
    if (sprintIds.length === 0) return [];
    return this.prisma.task.findMany({
      where: { sprintId: { in: sprintIds } },
      select: {
        id: true,
        sprintId: true,
        sprintAssignedAt: true,
        completedAt: true,
        estimatePoints: true,
      },
    });
  }

  /* ─── Documentos vinculados (E9 de `docs/PLAN-DOCUMENTOS.md`) ────────── */

  async taskDocuments(taskId: string, projectId: string) {
    await this.loadTaskInProject(taskId, projectId);
    return this.prisma.taskDocument.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      select: { documentId: true, linkedBy: true, createdAt: true },
    });
  }

  /**
   * Vincula un documento. Que sea **del mismo proyecto** lo comprueba el
   * gateway, que es quien habla con projects-service; aquí la tarea y el permiso.
   */
  async linkDocument(dto: {
    taskId: string;
    projectId: string;
    documentId: string;
    requesterId: string;
  }) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');
    const task = await this.loadTaskInProject(dto.taskId, dto.projectId);
    await this.prisma.taskDocument.upsert({
      where: { taskId_documentId: { taskId: dto.taskId, documentId: dto.documentId } },
      create: { taskId: dto.taskId, documentId: dto.documentId, linkedBy: dto.requesterId },
      update: {},
    });
    await this.olvidarDocumentosEnCache(dto.taskId, task.boardId);
    return this.taskDocuments(dto.taskId, dto.projectId);
  }

  async unlinkDocument(dto: {
    taskId: string;
    projectId: string;
    documentId: string;
    requesterId: string;
  }) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');
    const task = await this.loadTaskInProject(dto.taskId, dto.projectId);
    await this.prisma.taskDocument.deleteMany({
      where: { taskId: dto.taskId, documentId: dto.documentId },
    });
    await this.olvidarDocumentosEnCache(dto.taskId, task.boardId);
    return this.taskDocuments(dto.taskId, dto.projectId);
  }

  /**
   * ⚠️ **Desde que `TASK_INCLUDE` lleva `documents`, vincular cambia también el
   * listado del tablero**, no solo la tarea suelta. Antes bastaba con borrar
   * `task:<id>` —y desvincular ni eso—; ahora, sin el prefijo del tablero, la
   * marca de la tarjeta seguiría diciendo lo de antes durante el minuto de
   * caché (trampa 26 de CLAUDE.md).
   */
  private async olvidarDocumentosEnCache(taskId: string, boardId: string) {
    await Promise.all([
      this.redis.del(`task:${taskId}`),
      this.redis.delByPrefix(`tasks:board:${boardId}`),
    ]);
  }

  /**
   * Tareas asignadas a una persona, dentro de los proyectos donde sigue estando.
   *
   * No se cachea: cambia con cada movimiento de cualquier tarea de cualquiera de
   * sus proyectos, y la clave tendría que depender de la query entera. El
   * índice `(projectId, dueDate)` y el de `TaskAssignee.userId` la hacen barata.
   */
  async findMyTasks(dto: FindMyTasksDto) {
    // Sin proyectos visibles no hay nada que buscar, y un `in: []` traería 0
    // igual pero pagando la consulta.
    if (dto.projectIds.length === 0) return { items: [], total: 0 };

    const projectIds = dto.projectId
      ? dto.projectIds.filter((id) => id === dto.projectId)
      : dto.projectIds;
    if (projectIds.length === 0) return { items: [], total: 0 };

    const where: Prisma.TaskWhereInput = {
      projectId: { in: projectIds },
      assignees: { some: { userId: dto.userId } },
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      // `not: null` explícito: sin él, las tareas sin fecha entrarían en un
      // filtro que pregunta justamente por vencimiento.
      ...(dto.dueBefore !== undefined && {
        dueDate: { not: null, lt: new Date(dto.dueBefore) },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        take: dto.limit ?? 50,
        // Lo que vence antes primero, y a igualdad la más urgente.
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
        include: TASK_INCLUDE,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items, total };
  }

  /** Resuelve todas las tareas de un proyecto, sin paginar. */
  async findTasksByProject(dto: FindTasksByProjectDto) {
    const cacheKey = `tasks:project:${dto.projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const tasks = await this.prisma.task.findMany({
      where: {
        projectId: dto.projectId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        boardId: true,
        columnId: true,
        reporterId: true,
        projectId: true,
        parentTaskId: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        assignees: {
          select: {
            userId: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const mapped = tasks.map((t) => ({
      ...t,
      assigneeId: t.assignees?.[0]?.userId ?? null,
      assigneeIds: t.assignees?.map((a) => a.userId) ?? [],
    }));

    await this.redis.set(cacheKey, mapped, PROJECT_TASKS_TTL);
    return mapped;
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

    /* Contra el tablero **de la tarea**, no contra el del cuerpo: este `PATCH`
       no recibe `boardId`, así que la referencia es la que ya está guardada. */
    if (dto.columnId !== undefined) {
      await this.assertColumnInBoard(task.boardId, dto.columnId);
    }
    if (dto.sprintId !== undefined && dto.sprintId !== task.sprintId) {
      await this.assertNoSaleDeUnSprintCerrado(task.sprintId);
      if (dto.sprintId !== null) await this.assertSprintInBoard(task.boardId, dto.sprintId);
    }

    // Se validan antes de abrir la transacción: si alguien no es del proyecto,
    // no se ha tocado nada todavía.
    const assignees =
      dto.assigneeIds !== undefined
        ? await this.resolveAssignees(dto.projectId, dto.assigneeIds)
        : undefined;
    const labels =
      dto.labelIds !== undefined
        ? await this.resolveLabels(dto.projectId, dto.labelIds)
        : undefined;

    /* Solo si el `PATCH` toca encargados. Omitirlos los deja como estaban, y
       entonces no hay nada de qué avisar ni por qué consultarlo. */
    const before = assignees !== undefined ? await this.currentAssignees(dto.id) : [];
    const assigneesChanged = this.assigneesChanged(before, assignees);

    /**
     * Este `PATCH` **también mueve**: acepta `columnId`. Se le da el mismo
     * tratamiento que a la ruta de mover, con la misma función, o una tarea
     * cerrada desde aquí no contaría como cerrada en ningún reporte.
     */
    const change =
      dto.columnId !== undefined
        ? this.resolveColumnChange({
            fromColumnId: task.columnId,
            toColumnId: dto.columnId,
            wasCompleted: task.completedAt !== null,
            isClosingColumn: dto.isClosingColumn,
          })
        : { events: [] as TaskEventDraft[], completedAt: undefined };
    const nextDueDate =
      dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null;
    const dueDateChanged =
      nextDueDate !== undefined &&
      (task.dueDate?.getTime() ?? null) !== (nextDueDate?.getTime() ?? null);
    const moved = change.events.some((event) => event.type === 'MOVED');
    const completed = change.events.some((event) => event.type === 'COMPLETED');
    const reopened = change.events.some((event) => event.type === 'REOPENED');
    const correlationId = randomUUID();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (assignees !== undefined) {
        await this.replaceAssignees(tx, dto.id, assignees, dto.requesterId);
      }
      if (labels !== undefined) {
        await this.replaceLabels(tx, dto.id, labels);
      }

      const saved = await tx.task.update({
        where: { id: dto.id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.columnId !== undefined && { columnId: dto.columnId }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          // `null` limpia la fecha; sin esto no habría forma de quitarla.
          ...(dto.dueDate !== undefined && {
            dueDate: nextDueDate,
          }),
          ...(change.completedAt !== undefined && { completedAt: change.completedAt }),
          // `sprintAssignedAt` se pisa junto con `sprintId`, tanto al entrar a
          // un sprint como al volver al backlog (`null`) — D9 de
          // `docs/PLAN-SCRUM-KANBAN.md` necesita saber el momento de los dos
          // cruces, no solo el de entrada.
          ...(dto.sprintId !== undefined && {
            sprintId: dto.sprintId,
            sprintAssignedAt: dto.sprintId ? new Date() : null,
          }),
          ...(dto.estimatePoints !== undefined && { estimatePoints: dto.estimatePoints }),
        },
        include: TASK_INCLUDE,
      });

      await this.recordEvents(tx, saved, dto.requesterId, [
        ...change.events,
        /* Solo si cambió de verdad: el diálogo manda la prioridad siempre, así
           que registrar cada `PATCH` llenaría el historial de cambios que no
           fueron y desvirtuaría cualquier análisis de repriorización. */
        ...(dto.priority !== undefined && dto.priority !== task.priority
          ? [
              {
                type: 'PRIORITY_CHANGED' as const,
                fromPriority: task.priority,
                toPriority: dto.priority,
              },
            ]
          : []),
        ...this.assigneeEvents(before, assignees),
      ]);

      const eventContext = {
        projectId: saved.projectId,
        taskId: saved.id,
        actor: { type: 'USER' as const, id: dto.requesterId },
        correlationId,
      };
      if (moved) {
        await this.domainOutbox.persist(tx, eventContext, {
          type: 'task.moved.v1',
          payload: { taskId: saved.id, fromColumnId: task.columnId, toColumnId: saved.columnId },
        });
      }
      if (dueDateChanged) {
        await this.domainOutbox.persist(tx, eventContext, {
          type: 'task.due-date-changed.v1',
          payload: {
            taskId: saved.id,
            previousDueDate: task.dueDate?.toISOString() ?? null,
            dueDate: saved.dueDate?.toISOString() ?? null,
          },
        });
      }
      if (completed) {
        if (!saved.completedAt) throw new Error('La tarea completada debe incluir completedAt');
        await this.domainOutbox.persist(tx, eventContext, {
          type: 'task.completed.v1',
          payload: { taskId: saved.id, completedAt: saved.completedAt.toISOString() },
        });
      }
      if (reopened) {
        await this.domainOutbox.persist(tx, eventContext, {
          type: 'task.reopened.v1',
          payload: { taskId: saved.id },
        });
      }
      if (assigneesChanged) {
        await this.domainOutbox.persist(tx, eventContext, {
          type: 'task.assignees-changed.v1',
          payload: {
            taskId: saved.id,
            assigneeIds: saved.assignees.map((assignee) => assignee.userId),
          },
        });
      }

      return saved;
    });

    await Promise.all([
      this.redis.del(`task:${dto.id}`),
      this.redis.delByPrefix(`tasks:board:${task.boardId}`),
    ]);

    if (assignees !== undefined) {
      await this.notifyAssigneeChanges({
        taskId: dto.id,
        taskTitle: updated.title,
        projectId: dto.projectId,
        actorId: dto.requesterId,
        before,
        after: assignees,
      });
    }

    return updated;
  }

  async moveTask(dto: MoveTaskDto) {
    // Mover no es editar: ver `CAN_MOVE_TASK` en el enum. `canEditTask` lo
    // implica por jerarquía, así que quien podía mover sigue pudiendo.
    await this.assertPermission(dto.requesterId, dto.projectId, 'canMoveTask');

    const task = await this.loadTaskInProject(dto.id, dto.projectId);

    /* Antes de tocar nada: mover a una columna de otro tablero deja la tarjeta
       sin columna donde pintarse y no hay forma de arrastrarla de vuelta. */
    await this.assertColumnInBoard(task.boardId, dto.columnId);

    /* El único sitio donde de verdad se mide el flujo del tablero. Si esto no
       queda registrado, no hay tiempo de ciclo que valga. */
    const change = this.resolveColumnChange({
      fromColumnId: task.columnId,
      toColumnId: dto.columnId,
      wasCompleted: task.completedAt !== null,
      isClosingColumn: dto.isClosingColumn,
    });

    const correlationId = randomUUID();
    const updated = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.task.update({
        where: { id: dto.id },
        data: {
          columnId: dto.columnId,
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.order !== undefined && { order: dto.order }),
          ...(change.completedAt !== undefined && { completedAt: change.completedAt }),
        },
        include: TASK_INCLUDE,
      });

      await this.recordEvents(tx, moved, dto.requesterId, change.events);
      if (task.columnId !== moved.columnId) {
        await this.domainOutbox.persist(
          tx,
          {
            projectId: moved.projectId,
            taskId: moved.id,
            actor: { type: 'USER', id: dto.requesterId },
            correlationId,
          },
          {
            type: 'task.moved.v1',
            payload: { taskId: moved.id, fromColumnId: task.columnId, toColumnId: moved.columnId },
          },
        );
      }
      if (change.events.some((event) => event.type === 'COMPLETED')) {
        if (!moved.completedAt) throw new Error('La tarea completada debe incluir completedAt');
        await this.domainOutbox.persist(
          tx,
          {
            projectId: moved.projectId,
            taskId: moved.id,
            actor: { type: 'USER', id: dto.requesterId },
            correlationId,
          },
          {
            type: 'task.completed.v1',
            payload: { taskId: moved.id, completedAt: moved.completedAt.toISOString() },
          },
        );
      }
      if (change.events.some((event) => event.type === 'REOPENED')) {
        await this.domainOutbox.persist(
          tx,
          {
            projectId: moved.projectId,
            taskId: moved.id,
            actor: { type: 'USER', id: dto.requesterId },
            correlationId,
          },
          {
            type: 'task.reopened.v1',
            payload: { taskId: moved.id },
          },
        );
      }
      return moved;
    });

    await Promise.all([
      this.redis.del(`task:${dto.id}`),
      this.redis.delByPrefix(`tasks:board:${task.boardId}`),
    ]);

    return updated;
  }

  async deleteTask(dto: DeleteTaskDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canDeleteTask');

    const task = await this.loadTaskInProject(dto.id, dto.projectId);
    const correlationId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      // Se vuelve a capturar dentro de la transacción: tras borrar no existe
      // ninguna fuente confiable para reconstruir el hecho durable.
      const snapshot = await tx.task.findUniqueOrThrow({ where: { id: dto.id } });
      if (snapshot.projectId !== dto.projectId) {
        throw new RpcException({ statusCode: 403, message: 'Forbidden' });
      }

      /**
       * El evento **antes** del borrado, y sobrevive a él.
       *
       * Aquí se ve por qué `TaskEvent` no tiene clave foránea hacia `Task`: con
       * `onDelete: Cascade` este registro —y todo el historial de la tarea— se
       * borraría en la misma operación, así que una tarea que se cerró y luego
       * se limpió del tablero desaparecería del throughput **retroactivamente**,
       * cambiando cifras del pasado que ya se habían enseñado.
       */
      await this.recordEvents(tx, snapshot, dto.requesterId, [
        { type: 'DELETED', fromColumnId: snapshot.columnId },
      ]);
      await this.domainOutbox.persist(
        tx,
        {
          projectId: snapshot.projectId,
          taskId: snapshot.id,
          actor: { type: 'USER', id: dto.requesterId },
          correlationId,
        },
        { type: 'task.deleted.v1', payload: { taskId: snapshot.id } },
      );
      await tx.task.delete({ where: { id: snapshot.id } });
    });

    await Promise.all([
      this.redis.del(`task:${dto.id}`),
      this.redis.delByPrefix(`tasks:board:${task.boardId}`),
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

    /* Quién había **antes**: es la única forma de saber a quién avisar de que
       entra y a quién de que sale. Después del reemplazo ya no existe. */
    const before = await this.currentAssignees(dto.id);
    const assigneesChanged = this.assigneesChanged(before, assignees);
    const correlationId = randomUUID();

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.replaceAssignees(tx, dto.id, assignees, dto.requesterId);
      const saved = await tx.task.findUniqueOrThrow({
        where: { id: dto.id },
        include: TASK_INCLUDE,
      });

      await this.recordEvents(tx, saved, dto.requesterId, this.assigneeEvents(before, assignees));
      if (assigneesChanged) {
        await this.domainOutbox.persist(
          tx,
          {
            projectId: saved.projectId,
            taskId: saved.id,
            actor: { type: 'USER', id: dto.requesterId },
            correlationId,
          },
          {
            type: 'task.assignees-changed.v1',
            payload: {
              taskId: saved.id,
              assigneeIds: saved.assignees.map((assignee) => assignee.userId),
            },
          },
        );
      }

      return saved;
    });

    await Promise.all([
      this.redis.del(`task:${dto.id}`),
      this.redis.delByPrefix(`tasks:board:${task.boardId}`),
    ]);

    await this.notifyAssigneeChanges({
      taskId: task.id,
      taskTitle: updated.title,
      projectId: dto.projectId,
      actorId: dto.requesterId,
      before,
      after: assignees,
    });

    return updated;
  }

  /**
   * Borra las tareas que se quedan sin sitio al eliminar un proyecto, un
   * espacio o un tablero. Ver `PurgeTasksDto`.
   *
   * No comprueba permisos: la comprobación la hizo el gateway al autorizar el
   * borrado del recurso padre, y para entonces ese recurso ya no existe, así
   * que aquí no habría nada contra lo que comprobar.
   */
  /**
   * Suelta a alguien de todas las tareas de unos proyectos.
   *
   * 🔴 **Suelta, no reasigna.** Elegir a quién le cae el trabajo de quien se va
   * es una decisión de equipo, y el sistema tomándola por su cuenta es
   * exactamente lo que el plan prohíbe —«nada se borra ni se archiva solo»—.
   * Sin encargado, la tarea sigue ahí, se ve en su columna y cualquiera la
   * recoge; reasignada a dedo, alguien se encuentra trabajo suyo que no pidió.
   *
   * ⚠️ **No toca las tareas de otros proyectos.** Se sale de **una**
   * organización, no de PRAXIS: lo que esa persona tenga en los proyectos de
   * otra sigue siendo suyo.
   *
   * ⚠️ **Y no emite avisos.** Ya mordió al revés: un autoguardado mandó una lista
   * de encargados vacía y a alguien le llegó un aviso de que lo habían quitado
   * de una tarea que nadie había tocado (`734855a`). Aquí quitar es la
   * consecuencia de haber salido del equipo, no una acción sobre la tarea, y
   * avisar de cada una sería cincuenta avisos por una sola salida.
   *
   * Devuelve cuántas soltó: el mensaje de la pantalla lo necesita para decir qué
   * ha pasado en vez de un «hecho» sin contenido.
   */
  async releaseAssignments(dto: { userId: string; projectIds: string[] }) {
    if (dto.projectIds.length === 0) return { soltadas: 0 };

    const resultado = await this.prisma.taskAssignee.deleteMany({
      where: { userId: dto.userId, task: { projectId: { in: dto.projectIds } } },
    });
    return { soltadas: resultado.count };
  }

  async purgeTasks(dto: PurgeTasksDto) {
    const where: Prisma.TaskWhereInput | null = dto.projectId
      ? { projectId: dto.projectId }
      : dto.boardIds && dto.boardIds.length > 0
        ? { boardId: { in: dto.boardIds } }
        : dto.columnId
          ? { columnId: dto.columnId }
          : null;

    // Sin criterio no se borra nada: un `where` vacío vaciaría la tabla entera.
    if (!where) return { deleted: 0 };

    /**
     * Las etiquetas del proyecto se van con él.
     *
     * Va **antes** de la salida por «no hay tareas»: un proyecto puede tener
     * etiquetas y ninguna tarea, y saliendo antes se quedarían para siempre.
     *
     * Solo al borrar el proyecto entero: borrar un tablero no debe llevarse las
     * etiquetas, que son del proyecto y las usan los demás tableros.
     */
    if (dto.projectId) {
      await this.prisma.label.deleteMany({ where: { projectId: dto.projectId } });
      await this.redis.del(`labels:project:${dto.projectId}`);

      /* Los campos personalizados, por lo mismo que las etiquetas: son del
         proyecto. Sus valores caen en cascada con el campo y con la tarea. */
      await this.prisma.customField.deleteMany({ where: { projectId: dto.projectId } });
      await this.redis.del(`fields:project:${dto.projectId}`);

      /**
       * Y el historial de eventos del proyecto.
       *
       * Es el **único** caso en que se borra: `TaskEvent` no tiene clave foránea
       * precisamente para sobrevivir al borrado de su tarea, pero si el proyecto
       * entero desaparece, sus eventos no describen ya nada consultable —no hay
       * ninguna ruta desde la que pedirlos— y se quedarían acumulándose sin
       * dueño. Es además lo que promete el diálogo de borrado: se va todo.
       *
       * Borrar un tablero o una columna **no** los toca: el proyecto sigue ahí y
       * sus reportes deben seguir cuadrando con lo que pasó.
       */
      await this.prisma.taskEvent.deleteMany({ where: { projectId: dto.projectId } });
    }

    // Se leen antes para saber qué claves de caché invalidar; después del
    // borrado ya no hay forma de saberlo.
    const affected = await this.prisma.task.findMany({
      where,
      select: { id: true, boardId: true },
    });
    if (affected.length === 0) return { deleted: 0 };

    const { count } = await this.prisma.task.deleteMany({ where });

    const boardIds = [...new Set(affected.map((t) => t.boardId))];
    await Promise.all([
      ...affected.map((t) => this.redis.del(`task:${t.id}`)),
      ...boardIds.map((id) => this.redis.delByPrefix(`tasks:board:${id}`)),
    ]);

    return { deleted: count };
  }

  /**
   * Pone al día el `status` de las tareas de una columna renombrada.
   *
   * No comprueba permisos, igual que `purgeTasks` y por el mismo motivo: la
   * comprobación (`canEditColumn`) la hizo el gateway al autorizar el cambio de
   * nombre de la columna, que es el recurso sobre el que se actúa.
   *
   * Solo toca las filas que no coinciden ya, así que es idempotente y un
   * renombrado que no cambia nada no escribe nada.
   *
   * ⚠️ **No emite ningún `TaskEvent`, y es deliberado.** Renombrar una columna
   * no mueve ninguna tarea: cambia la etiqueta del sitio donde ya estaban.
   * Emitir `MOVED` aquí fabricaría un movimiento por cada tarea de la columna,
   * todos con la misma marca de tiempo, y el tiempo de ciclo de un tablero
   * quedaría destrozado por un cambio de nombre.
   *
   * Es también la razón de que los eventos guarden **`columnId` y nunca
   * `status`**: el `status` es un nombre y cambia sin que nada se mueva, así que
   * un historial apoyado en él registraría movimientos que no ocurrieron.
   */
  async restatusTasks(dto: RestatusTasksDto) {
    // Se leen antes: después del update ya no hay forma de saber cuáles eran
    // para invalidar sus claves de caché.
    const affected = await this.prisma.task.findMany({
      where: { columnId: dto.columnId, status: { not: dto.status } },
      select: { id: true, boardId: true },
    });
    if (affected.length === 0) return { updated: 0 };

    const { count } = await this.prisma.task.updateMany({
      where: { columnId: dto.columnId, status: { not: dto.status } },
      data: { status: dto.status },
    });

    /**
     * ⚠️ Las dos claves. `tasks:board:` es la que se olvida: el `status` viaja
     * dentro de la tarea también en el listado del tablero, así que sin
     * invalidarla la pantalla enseña el estado viejo durante un minuto.
     */
    const boardIds = [...new Set(affected.map((task) => task.boardId))];
    await Promise.all([
      ...affected.map((task) => this.redis.del(`task:${task.id}`)),
      ...boardIds.map((id) => this.redis.delByPrefix(`tasks:board:${id}`)),
    ]);

    return { updated: count };
  }

  // ─── Subtasks ─────────────────────────────────────────────────────────────

  async createSubtask(dto: CreateTaskDto) {
    if (!dto.parentTaskId) {
      throw new RpcException({
        statusCode: 400,
        message: 'Se requiere parentTaskId para crear una subtarea',
      });
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
        text: dto.text,
        order: dto.order ?? 0,
      },
    });

    await Promise.all([
      this.redis.del(`task:${dto.taskId}`),
      this.redis.delByPrefix(`tasks:board:${task.boardId}`),
    ]);

    return item;
  }

  async toggleChecklist(dto: ToggleChecklistDto) {
    // Marcar un paso es ejecutar, no editar: ver la nota del controlador del
    // gateway. `canEditTask` lo implica por jerarquía.
    await this.assertPermission(dto.requesterId, dto.projectId, 'canMoveTask');

    const item = await this.loadChecklistInProject(dto.id, dto.projectId);

    const updated = await this.prisma.checklist.update({
      where: { id: dto.id },
      data: { completed: !item.completed },
    });

    // También la lista del tablero: la tarjeta enseña el avance del checklist,
    // y sin esto se queda con el recuento viejo hasta que caduque (trampa #3).
    await Promise.all([
      this.redis.del(`task:${item.taskId}`),
      this.redis.delByPrefix(`tasks:board:${item.task.boardId}`),
    ]);

    return updated;
  }

  async deleteChecklist(dto: DeleteChecklistDto) {
    await this.assertPermission(dto.requesterId, dto.projectId, 'canEditTask');

    const item = await this.loadChecklistInProject(dto.id, dto.projectId);

    await this.prisma.checklist.delete({ where: { id: dto.id } });

    await Promise.all([
      this.redis.del(`task:${item.taskId}`),
      this.redis.delByPrefix(`tasks:board:${item.task.boardId}`),
    ]);

    return { success: true };
  }
}
