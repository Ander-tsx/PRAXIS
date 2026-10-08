import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import {
  CUSTOM_FIELDS_MAX_PER_PROJECT,
  CUSTOM_FIELD_TEXT_MAX,
  CUSTOM_FIELD_TYPES_WITH_OPTIONS,
  CUSTOM_FIELD_URL_MAX,
  type CreateCustomFieldDto,
  type CustomFieldOptionDto,
  type CustomFieldType,
  type DeleteCustomFieldDto,
  type FindCustomFieldsDto,
  type SetTaskFieldValueDto,
  type UpdateCustomFieldDto,
} from '@praxis/contracts';
import { opcionesDeCliente } from '@praxis/local-transport';

import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const FIELDS_TTL = 300; // 5 min

/** Una opción de `SELECT` / `MULTI_SELECT` tal como se guarda. */
type FieldOption = { id: string; name: string; color: string };

/**
 * Lo que se escribe en `TaskFieldValue` para un valor ya validado. `null` =
 * vaciar el campo, que es **borrar la fila**: sin fila es vacío.
 */
type StoredValue = {
  text: string | null;
  number: number | null;
  date: Date | null;
  bool: boolean | null;
  ids: string[];
} | null;

/**
 * Campos personalizados de un proyecto y sus valores en cada tarea
 * (`docs/PLAN-CAMPOS-PERSONALIZADOS.md`).
 *
 * Aparte de `TasksService` por lo mismo que las etiquetas: la definición es del
 * proyecto, no de una tarea. Los permisos los comprueba el gateway
 * (`canEditTask` para escribir, D2); aquí se comprueba que cada id sea **del
 * proyecto de la ruta**, que es lo que el guard no puede saber.
 *
 * ⚠️ **Escribir un valor no pasa por el `PATCH` de la tarea, y es a propósito**
 * (D5). Ese `PATCH` reescribe encargados y etiquetas, avisa a quien entra o sale
 * y despierta a las reglas de automatización; un cambio de «Reviewer» no debe
 * hacer nada de eso. Tampoco genera `TaskEvent`: el historial lo leen los
 * informes de flujo, y un campo libre no es flujo.
 */
@Injectable()
export class CustomFieldsService {
  private readonly projectsClient: ClientProxy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.projectsClient = ClientProxyFactory.create(opcionesDeCliente('PROJECTS', this.config));
  }

  private cacheKey(projectId: string) {
    return `fields:project:${projectId}`;
  }

  async findFields(dto: FindCustomFieldsDto) {
    const key = this.cacheKey(dto.projectId);
    const cached = await this.redis.get(key);
    if (cached) return cached;

    const fields = await this.prisma.customField.findMany({
      where: { projectId: dto.projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    await this.redis.set(key, fields, FIELDS_TTL);
    return fields;
  }

  async createField(dto: CreateCustomFieldDto) {
    const type = dto.type as CustomFieldType;
    const count = await this.prisma.customField.count({ where: { projectId: dto.projectId } });
    if (count >= CUSTOM_FIELDS_MAX_PER_PROJECT) {
      throw new RpcException({
        statusCode: 400,
        message: `Un proyecto admite hasta ${CUSTOM_FIELDS_MAX_PER_PROJECT} campos`,
      });
    }

    const options = takesOptions(type) ? normalizeOptions(dto.options ?? [], []) : [];

    try {
      const field = await this.prisma.customField.create({
        data: {
          projectId: dto.projectId,
          name: dto.name.trim(),
          type,
          options,
          showOnCard: dto.showOnCard ?? false,
          // Al final: el campo nuevo es la columna nueva de la derecha.
          order: count,
        },
      });
      await this.invalidate(dto.projectId);
      return field;
    } catch (error) {
      throw duplicatedName(error, dto.name) ?? error;
    }
  }

  async updateField(dto: UpdateCustomFieldDto) {
    const field = await this.loadInProject(dto.id, dto.projectId);
    const type = field.type as CustomFieldType;
    const previous = readOptions(field.options);

    const options =
      dto.options !== undefined && takesOptions(type)
        ? normalizeOptions(dto.options, previous)
        : undefined;

    /* Las opciones que desaparecen se quitan de las tareas que las tenían: un
       valor que apunta a una opción borrada se pintaría como un id crudo. */
    const removed = options
      ? previous.filter((old) => !options.some((o) => o.id === old.id)).map((o) => o.id)
      : [];

    /* Qué tareas repintar se averigua **antes** de tocar nada: después de quitar
       la opción, la fila que la llevaba ya no existe y no habría forma de
       saberlo —el panel seguiría enseñando la opción borrada durante el minuto
       de caché—. */
    const stale = removed.length > 0 ? await this.tasksWithField(field.id) : [];

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (removed.length > 0) {
          if (type === 'SELECT') {
            await tx.taskFieldValue.deleteMany({
              where: { fieldId: field.id, text: { in: removed } },
            });
          } else {
            await stripIds(tx, field.id, removed);
          }
        }

        return tx.customField.update({
          where: { id: field.id },
          data: {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(options !== undefined && { options }),
            ...(dto.showOnCard !== undefined && { showOnCard: dto.showOnCard }),
            ...(dto.order !== undefined && { order: dto.order }),
          },
        });
      });

      await this.invalidate(dto.projectId);
      await this.invalidateTasks(stale);
      return updated;
    } catch (error) {
      throw duplicatedName(error, dto.name ?? field.name) ?? error;
    }
  }

  /**
   * Borra el campo y **sus valores en todas las tareas** (cascada). Devuelve en
   * cuántas tenía algo, para que la interfaz pueda decir qué se perdió.
   */
  async deleteField(dto: DeleteCustomFieldDto) {
    const field = await this.loadInProject(dto.id, dto.projectId);

    // Antes de borrar: después la relación ya no existe.
    const stale = await this.tasksWithField(field.id);

    await this.prisma.customField.delete({ where: { id: field.id } });
    await this.invalidate(dto.projectId);
    await this.invalidateTasks(stale);
    const usos = stale.length;

    return { success: true, removedFrom: usos };
  }

  /** Escribe —o vacía, con `null`— el valor de un campo en una tarea. */
  async setValue(dto: SetTaskFieldValueDto) {
    const [task, field] = await Promise.all([
      this.prisma.task.findUnique({ where: { id: dto.taskId } }),
      this.prisma.customField.findUnique({ where: { id: dto.fieldId } }),
    ]);
    if (!task) throw new RpcException({ statusCode: 404, message: 'Tarea no encontrada' });
    if (!field) throw new RpcException({ statusCode: 404, message: 'Campo no encontrado' });
    /* Las dos cosas del proyecto de la ruta, y no solo la tarea: un campo de
       otro proyecto dejaría en esta tarea un valor que ninguna columna enseña. */
    if (task.projectId !== dto.projectId || field.projectId !== dto.projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }

    const stored = await this.normalizeValue(
      field.type as CustomFieldType,
      readOptions(field.options),
      dto.value,
      dto.projectId,
    );

    const where = { taskId_fieldId: { taskId: task.id, fieldId: field.id } };
    if (stored === null) {
      await this.prisma.taskFieldValue.deleteMany({
        where: { taskId: task.id, fieldId: field.id },
      });
    } else {
      await this.prisma.taskFieldValue.upsert({
        where,
        create: { taskId: task.id, fieldId: field.id, ...stored },
        update: stored,
      });
    }

    await Promise.all([
      this.redis.del(`task:${task.id}`),
      this.redis.delByPrefix(`tasks:board:${task.boardId}`),
    ]);

    return { taskId: task.id, fieldId: field.id, value: stored };
  }

  /**
   * Convierte lo que llega del cliente en la columna que le toca al tipo, o
   * responde 400 diciendo qué esperaba.
   *
   * Vacío —`null`, `''`, `[]`— es siempre «vaciar», en todos los tipos menos
   * `CHECKBOX`, donde `false` es un valor y no la ausencia de uno.
   */
  private async normalizeValue(
    type: CustomFieldType,
    options: FieldOption[],
    raw: unknown,
    projectId: string,
  ): Promise<StoredValue> {
    const base = { text: null, number: null, date: null, bool: null, ids: [] as string[] };
    const isEmpty =
      raw === null ||
      raw === undefined ||
      (typeof raw === 'string' && raw.trim() === '') ||
      (Array.isArray(raw) && raw.length === 0);
    if (isEmpty) return null;

    switch (type) {
      case 'TEXT': {
        if (typeof raw !== 'string') throw bad('Se esperaba un texto');
        const text = raw.trim();
        if (text.length > CUSTOM_FIELD_TEXT_MAX) {
          throw bad(`El texto no puede pasar de ${CUSTOM_FIELD_TEXT_MAX} caracteres`);
        }
        return { ...base, text };
      }
      case 'URL': {
        if (typeof raw !== 'string') throw bad('Se esperaba un enlace');
        const text = raw.trim();
        if (text.length > CUSTOM_FIELD_URL_MAX || !isHttpUrl(text)) {
          throw bad('El enlace tiene que empezar por http:// o https://');
        }
        return { ...base, text };
      }
      case 'NUMBER': {
        const number = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw;
        if (typeof number !== 'number' || !Number.isFinite(number)) {
          throw bad('Se esperaba un número');
        }
        return { ...base, number };
      }
      case 'DATE': {
        /* Solo el día, como la fecha límite: una hora aquí movería el día al
           cruzar husos horarios. Se guarda a mediodía UTC por lo mismo. */
        if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(raw)) {
          throw bad('Se esperaba una fecha (aaaa-mm-dd)');
        }
        const date = new Date(`${raw.slice(0, 10)}T12:00:00.000Z`);
        if (Number.isNaN(date.getTime())) throw bad('Esa fecha no existe');
        return { ...base, date };
      }
      case 'CHECKBOX': {
        if (typeof raw !== 'boolean') throw bad('Se esperaba sí o no');
        return { ...base, bool: raw };
      }
      case 'SELECT': {
        if (typeof raw !== 'string' || !options.some((o) => o.id === raw)) {
          throw bad('Esa opción no existe en el campo');
        }
        return { ...base, text: raw };
      }
      case 'MULTI_SELECT': {
        const ids = stringList(raw);
        if (!ids || ids.some((id) => !options.some((o) => o.id === id))) {
          throw bad('Alguna de las opciones no existe en el campo');
        }
        return { ...base, ids };
      }
      case 'PERSON': {
        const ids = stringList(raw);
        if (!ids) throw bad('Se esperaba una lista de personas');
        await this.assertMembers(projectId, ids);
        return { ...base, ids };
      }
    }
  }

  /**
   * Solo personas del proyecto, con el mismo criterio que los encargados
   * (`TasksService.resolveAssignees`): miembros más el dueño.
   */
  private async assertMembers(projectId: string, userIds: string[]) {
    const [members, project] = await Promise.all([
      firstValueFrom(this.projectsClient.send({ cmd: 'member_find_all' }, { projectId })),
      firstValueFrom(this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId })),
    ]);
    const allowed = new Set<string>(((members ?? []) as { userId: string }[]).map((m) => m.userId));
    if (project?.ownerId) allowed.add(project.ownerId);
    if (userIds.some((id) => !allowed.has(id))) {
      throw bad('Solo se puede elegir a personas del proyecto');
    }
  }

  /** Comprueba que el campo es del proyecto de la ruta. */
  private async loadInProject(id: string, projectId: string) {
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) throw new RpcException({ statusCode: 404, message: 'Campo no encontrado' });
    if (field.projectId !== projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    return field;
  }

  /** Las tareas que tienen algo en el campo. Se pide antes de borrar. */
  private async tasksWithField(fieldId: string) {
    const rows = await this.prisma.taskFieldValue.findMany({
      where: { fieldId },
      select: { task: { select: { id: true, boardId: true } } },
    });
    return rows.map((row) => row.task);
  }

  /**
   * Invalida esas tareas y sus tableros.
   *
   * ⚠️ El tablero con `delByPrefix`, nunca `del`: su caché lleva sufijos
   * (`:col:`, `:sprint:`, `:p1:l50`) y un `del` exacto dejaría vivas las
   * variantes filtradas (trampa 26 de CLAUDE.md).
   */
  private async invalidateTasks(tasks: { id: string; boardId: string }[]) {
    if (tasks.length === 0) return;
    const boardIds = [...new Set(tasks.map((task) => task.boardId))];
    await Promise.all([
      ...tasks.map((task) => this.redis.del(`task:${task.id}`)),
      ...boardIds.map((id) => this.redis.delByPrefix(`tasks:board:${id}`)),
    ]);
  }

  private async invalidate(projectId: string) {
    await this.redis.del(this.cacheKey(projectId));
  }
}

function takesOptions(type: CustomFieldType) {
  return CUSTOM_FIELD_TYPES_WITH_OPTIONS.includes(type);
}

/** Lee las opciones guardadas, tolerando un `Json` que no sea la lista esperada. */
function readOptions(value: Prisma.JsonValue): FieldOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (o): o is FieldOption =>
      typeof o === 'object' && o !== null && typeof (o as FieldOption).id === 'string',
  ) as FieldOption[];
}

/**
 * Da id a las opciones nuevas y conserva el de las que ya existían.
 *
 * Un `id` que el cliente invente y no estuviera antes se trata como opción
 * nueva y se cambia: si no, se podría «resucitar» un id que unas tareas aún
 * guardan con otro significado.
 */
function normalizeOptions(input: CustomFieldOptionDto[], previous: FieldOption[]): FieldOption[] {
  const known = new Set(previous.map((o) => o.id));
  const names = new Set<string>();
  const result: FieldOption[] = [];
  for (const option of input) {
    const name = option.name.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase('es');
    if (names.has(key)) throw bad(`La opción «${name}» está repetida`);
    names.add(key);
    result.push({
      id: option.id && known.has(option.id) ? option.id : randomUUID(),
      name,
      color: option.color,
    });
  }
  return result;
}

/** Una lista de cadenas sin repetidos, o `null` si no lo es. */
function stringList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) return null;
  return [...new Set(raw as string[])];
}

/** Quita unos ids de la columna `ids` de un campo, y borra las filas que se quedan vacías. */
async function stripIds(tx: Prisma.TransactionClient, fieldId: string, removed: string[]) {
  const rows = await tx.taskFieldValue.findMany({
    where: { fieldId, ids: { hasSome: removed } },
    select: { taskId: true, ids: true },
  });
  for (const row of rows) {
    const ids = row.ids.filter((id) => !removed.includes(id));
    if (ids.length === 0) {
      await tx.taskFieldValue.delete({
        where: { taskId_fieldId: { taskId: row.taskId, fieldId } },
      });
    } else {
      await tx.taskFieldValue.update({
        where: { taskId_fieldId: { taskId: row.taskId, fieldId } },
        data: { ids },
      });
    }
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function bad(message: string) {
  return new RpcException({ statusCode: 400, message });
}

/** P2002: ya hay un campo con ese nombre en el proyecto. Sin esto, un 500 mudo. */
function duplicatedName(error: unknown, name: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  ) {
    return new RpcException({
      statusCode: 409,
      message: `Ya existe un campo «${name}» en este proyecto`,
    });
  }
  return null;
}
