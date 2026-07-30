import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Agregación sobre las tareas y su historial.
 *
 * Vive **aquí y no en reports-service** porque los datos son de este servicio.
 * Es la frontera que se eligió al diseñar la sección: cada servicio agrega lo
 * suyo y `reports` orquesta y hace la matemática. La alternativa —que `reports`
 * leyera el esquema `tasks` directamente— habría sido mucho menos código, a
 * cambio de que un cambio de esquema aquí rompiera los reportes en silencio.
 *
 * Estas son las primeras consultas agregadas del backend: hasta ahora no había
 * ni un `groupBy` en todo el proyecto.
 *
 * **Ninguna comprueba permisos.** Lo hizo el gateway antes de llamar, contra el
 * `projectId` de la ruta, igual que en `purgeTasks` y `restatusTasks`.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Foto del estado **actual** del proyecto.
   *
   * Es el único informe que no necesita historial, así que es el que funciona
   * desde el primer día. Todo sale de la tabla `tasks`, sin tocar los eventos.
   */
  async snapshot(projectId: string) {
    const [byPriority, byColumn, byLabel, byAssignee, totals] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['priority'],
        where: { projectId },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['columnId'],
        where: { projectId },
        _count: { _all: true },
      }),
      /* Las etiquetas cuelgan de la tarea por una tabla puente, así que se
         agrupan sobre ella acotando por las tareas del proyecto. */
      this.prisma.taskLabel.groupBy({
        by: ['labelId'],
        where: { task: { projectId } },
        _count: { _all: true },
      }),
      this.prisma.taskAssignee.groupBy({
        by: ['userId'],
        where: { task: { projectId } },
        _count: { _all: true },
      }),
      this.totals(projectId),
    ]);

    return {
      byPriority: byPriority.map((row) => ({ priority: row.priority, count: row._count._all })),
      byColumn:   byColumn.map((row) => ({ columnId: row.columnId, count: row._count._all })),
      byLabel:    byLabel.map((row) => ({ labelId: row.labelId, count: row._count._all })),
      byAssignee: byAssignee.map((row) => ({ userId: row.userId, count: row._count._all })),
      ...totals,
    };
  }

  /**
   * Los totales que no salen de un `groupBy`.
   *
   * ⚠️ `completedAt` distingue **cerrada** de **abierta**, pero solo para lo que
   * se cerró desde que existe el historial. Lo cerrado antes tiene `null` y
   * cuenta como abierto: no hay forma de saber cuándo llegó a su columna. Quien
   * pinte esto tiene que decirlo, no disimularlo.
   */
  private async totals(projectId: string) {
    const ahora = new Date();

    const [total, completed, overdue, unassigned, checklistItems, checklistDone] =
      await Promise.all([
        this.prisma.task.count({ where: { projectId } }),
        this.prisma.task.count({ where: { projectId, completedAt: { not: null } } }),
        /* Vencidas: con fecha pasada y **sin cerrar**. Una tarea entregada no
           vence, que es la misma regla que ya aplica la tarjeta del tablero. */
        this.prisma.task.count({
          where: { projectId, completedAt: null, dueDate: { lt: ahora } },
        }),
        this.prisma.task.count({ where: { projectId, assignees: { none: {} } } }),
        this.prisma.checklist.count({ where: { task: { projectId } } }),
        this.prisma.checklist.count({ where: { task: { projectId }, completed: true } }),
      ]);

    return { total, completed, overdue, unassigned, checklistItems, checklistDone };
  }

  /**
   * Tiempos de las tareas ya cerradas.
   *
   * Devuelve **una fila por tarea**, no un promedio: los percentiles los calcula
   * reports-service, y con la media no se pueden reconstruir. Además la media de
   * un tiempo de ciclo miente casi siempre —la distribución tiene cola larga— y
   * devolverla invitaría a enseñarla.
   *
   * - `leadHours`: de crear a cerrar. Lo que espera quien pidió el trabajo.
   * - `cycleHours`: del **primer movimiento** a cerrar. Lo que tarda el trabajo
   *   una vez empieza. Si nunca se movió antes de cerrarse, es `null`: no se
   *   inventa un cero.
   */
  async cycleTimes(projectId: string, from?: Date) {
    const rows = await this.prisma.$queryRaw<
      { taskId: string; completedAt: Date; createdAt: Date; firstMovedAt: Date | null }[]
    >`
      SELECT t.id                        AS "taskId",
             t."completedAt"             AS "completedAt",
             t."createdAt"               AS "createdAt",
             MIN(e."occurredAt") FILTER (WHERE e.type = 'MOVED') AS "firstMovedAt"
        FROM tasks.tasks t
        LEFT JOIN tasks.task_events e ON e."taskId" = t.id
       WHERE t."projectId" = ${projectId}::text
         AND t."completedAt" IS NOT NULL
         AND (${from ?? null}::timestamp IS NULL OR t."completedAt" >= ${from ?? null}::timestamp)
       GROUP BY t.id, t."completedAt", t."createdAt"
       ORDER BY t."completedAt"
    `;

    const horas = (desde: Date, hasta: Date) =>
      (hasta.getTime() - desde.getTime()) / 3_600_000;

    return rows.map((row) => ({
      taskId:      row.taskId,
      completedAt: row.completedAt,
      leadHours:   horas(row.createdAt, row.completedAt),
      cycleHours:
        row.firstMovedAt && row.firstMovedAt < row.completedAt
          ? horas(row.firstMovedAt, row.completedAt)
          : null,
    }));
  }

  /**
   * Cuántas tareas entraron y salieron de cada columna, por día.
   *
   * Es la materia prima del **diagrama de flujo acumulado**: reports-service la
   * convierte en el acumulado corriendo el saldo día a día.
   *
   * Va en SQL crudo porque `groupBy` de Prisma no sabe truncar una fecha a día,
   * y agrupar en memoria obligaría a traerse el historial entero.
   *
   * Cuenta **movimientos**, no estados, así que una tarea creada y nunca movida
   * no aparece hasta que se mueve. El acumulado arranca del `CREATED`, que
   * también se cuenta como entrada.
   */
  async dailyFlow(projectId: string, from: Date) {
    return this.prisma.$queryRaw<
      { day: Date; columnId: string | null; entradas: number; salidas: number }[]
    >`
      WITH movimientos AS (
        SELECT date_trunc('day', "occurredAt") AS day,
               "toColumnId"   AS entra,
               "fromColumnId" AS sale
          FROM tasks.task_events
         WHERE "projectId" = ${projectId}::text
           AND "occurredAt" >= ${from}::timestamp
           AND type IN ('CREATED', 'MOVED', 'DELETED')
      )
      SELECT day,
             col AS "columnId",
             -- ⚠️ El ::int no es cosmético. COUNT(*) de Postgres es bigint, y un
             -- BigInt de JavaScript **no se puede serializar a JSON**: la
             -- respuesta reventaba al cruzar el TCP hacia el gateway con «Do not
             -- know how to serialize a BigInt», y el error llegaba como un 500
             -- sin pista ninguna. Se convierte aquí, en el borde del SQL.
             COUNT(*) FILTER (WHERE dir = 'in')::int  AS entradas,
             COUNT(*) FILTER (WHERE dir = 'out')::int AS salidas
        FROM (
          SELECT day, entra AS col, 'in'  AS dir FROM movimientos WHERE entra IS NOT NULL
          UNION ALL
          SELECT day, sale  AS col, 'out' AS dir FROM movimientos WHERE sale  IS NOT NULL
        ) t
       GROUP BY day, col
       ORDER BY day
    `;
  }

  /**
   * Carga y flujo **por persona**.
   *
   * Se enseña como reparto, no como clasificación: quién lleva cuánto abierto,
   * cuánto ha cerrado y en cuánto tiempo. Deliberadamente **no** devuelve nada
   * que ordene a la gente por «productividad», porque el dato que tenemos no
   * sabe de dificultad ni de contexto y un número así se lee como una nota.
   *
   * La ruta que lo expone pide `canViewReports`, no `canViewProject`.
   */
  async byPerson(projectId: string) {
    return this.prisma.$queryRaw<
      {
        userId: string;
        abiertas: number;
        cerradas: number;
        vencidas: number;
        medianaHoras: number | null;
      }[]
    >`
      SELECT a."userId",
             -- ::int por lo mismo que en dailyFlow: un bigint no llega vivo al
             -- otro lado del TCP. (Sin acentos graves aquí dentro: estamos en un
             -- template literal y lo cerrarían a media consulta.)
             COUNT(*) FILTER (WHERE t."completedAt" IS NULL)::int                         AS abiertas,
             COUNT(*) FILTER (WHERE t."completedAt" IS NOT NULL)::int                      AS cerradas,
             COUNT(*) FILTER (WHERE t."completedAt" IS NULL AND t."dueDate" < now())::int AS vencidas,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (t."completedAt" - t."createdAt")) / 3600
             ) FILTER (WHERE t."completedAt" IS NOT NULL)                              AS "medianaHoras"
        FROM tasks.task_assignees a
        JOIN tasks.tasks t ON t.id = a."taskId"
       WHERE t."projectId" = ${projectId}::text
       GROUP BY a."userId"
    `;
  }
}
