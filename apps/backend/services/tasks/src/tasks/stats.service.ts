import { Injectable } from '@nestjs/common';
import type { ReportFilters } from '@praxis/contracts';

import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `actorId` con el que la semilla marca los eventos que fabricó.
 *
 * Espejo de `ACTOR_SINTETICO` en `prisma/seed-events.ts`. Es el UUID de ceros,
 * que no puede ser el id de nadie, y sirve para que la interfaz pueda avisar de
 * que un proyecto no mide trabajo real. Un gráfico fabricado sin etiquetar es el
 * peor resultado posible de esta sección.
 */
const ACTOR_SINTETICO = '00000000-0000-0000-0000-000000000000';

/**
 * Techo del inventario que se le pasa al asistente.
 *
 * Hoy es deliberadamente alto: se quiere que pueda hablar de **cualquier**
 * tarea del proyecto. No es un tope de producto, es un cortafuegos — el
 * contexto viaja en cada turno, así que sin ningún límite un proyecto grande
 * podría reventar la ventana del modelo y encarecer cada mensaje sin avisar.
 *
 * Si algún día hace falta recortar de verdad, el sitio es este y el criterio
 * está en el `orderBy` de `inventory`: se corta por lo cerrado y lo viejo.
 */
const LIMITE_INVENTARIO = 500;

/**
 * El techo **real** del inventario, en caracteres de JSON.
 *
 * ## Por qué un presupuesto y no un número de tareas
 *
 * `LIMITE_INVENTARIO` topa filas, y una fila no cuesta lo mismo que otra: una
 * tarea abierta con tres encargados y un checklist ocupa el doble que una
 * cerrada. Topar por filas deja el coste real oscilando según qué haya dentro,
 * que es justo lo que no se quiere acotar a ojo.
 *
 * ## Lo que arregla, que no es el precio de hoy
 *
 * Esto viaja **entero, en cada turno**, dentro de la instrucción de sistema. Sin
 * techo, el prompt crecía con el proyecto y nada lo paraba: 186 tareas eran
 * ~14 000 tokens; mil serían ~75 000. El problema no es solo la factura —a
 * tarifa de gama Flash son céntimos— son las otras dos consecuencias: **el turno
 * tarda más** y, sobre todo, **las reglas se ahogan**. Un modelo con setenta mil
 * tokens de inventario delante deja de prestar atención a las diez líneas que le
 * dicen cómo comportarse, así que el asistente empeoraría precisamente en los
 * proyectos grandes, que es donde más falta hace.
 *
 * 45 000 caracteres son ~11 000 tokens: cabe entero cualquier proyecto de hasta
 * un centenar largo de tareas, y a partir de ahí el coste **deja de crecer**.
 *
 * ## Lo que se corta primero
 *
 * El `orderBy` ya pone las abiertas delante y, dentro de las cerradas, las más
 * antiguas al final. Así que lo que cae es lo que menos falta hace: trabajo
 * terminado hace tiempo. **Y se dice cuántas faltan** —`omitidas` en la
 * respuesta— porque un recorte mudo hace que el modelo responda «no hay ninguna
 * más» con total seguridad sobre una lista que alguien le cortó.
 */
const INVENTARIO_MAX_CHARS = 45_000;

/**
 * Cuánto de la descripción de una tarea entra en el inventario.
 *
 * Es el **único campo sin techo** de todo lo que viaja en cada turno: el título
 * está acotado por el formulario, los ids miden lo que miden, pero una
 * descripción puede ser una página entera — y multiplicada por las tareas
 * abiertas de un proyecto real, es la vía por la que esto se desmadra sin que
 * nadie lo vea venir.
 *
 * 500 caracteres son dos o tres frases: suficiente para saber de qué va la
 * tarea, que es para lo que el modelo la lee. Lo que se corta **se avisa**, para
 * que no hable con seguridad de un texto del que solo ha visto el principio.
 */
const MAX_DESCRIPCION_INVENTARIO = 500;

/** La descripción, acotada y diciendo que se acotó. */
function recortar(descripcion: string | null): string | null {
  if (!descripcion || descripcion.length <= MAX_DESCRIPCION_INVENTARIO) return descripcion;
  return `${descripcion.slice(0, MAX_DESCRIPCION_INVENTARIO)} […]`;
}

/**
 * ─── Los filtros de Análisis ──────────────────────────────────────────────
 *
 * Cinco campos —`from`, `to`, `boardId`, `assigneeId`, `labelId`, `priority`—
 * que el gateway valida una vez y llegan hasta aquí sin cambiar de forma. Los
 * cinco existen en el esquema de tareas, así que no hay nada que traducir: ni
 * siquiera el tablero, porque `Task` guarda `boardId` además de `columnId`.
 *
 * ## ⚠️ Qué acota `from`/`to`, que no es lo mismo en todos los informes
 *
 * Y no puede serlo, porque los informes no miden lo mismo:
 *
 * | Informe | El tramo acota | Por qué |
 * |---|---|---|
 * | `snapshot`, `sinMovimiento`, `byPerson` | `createdAt` | Miden **estado de ahora**. Un tramo aquí solo puede querer decir «de las tareas que entraron en él» |
 * | `cycleTimes` | `completedAt` | Mide lo que se cerró |
 * | `dailyFlow` | `occurredAt` | Mide movimientos |
 * | `weeklyThroughput` | la serie de semanas | El tramo **es** el eje |
 *
 * Se escribe aquí porque es la clase de diferencia que no da ningún error: los
 * cuatro devuelven un gráfico plausible con cualquier criterio.
 */

/**
 * Los filtros como `where` de Prisma, para las consultas que no van en SQL crudo.
 *
 * ⚠️ **El campo de fecha es `createdAt` y no se parametriza**, aunque
 * `sqlDeTarea` sí lo haga. Los tres informes que pasan por aquí miden estado
 * actual y ya usan `completedAt` para otra cosa —`completed`, `overdue`—:
 * dejarlo elegir habría permitido pedir un `where` con dos condiciones
 * incompatibles sobre la misma columna, que Prisma resuelve quedándose con una y
 * sin decir cuál.
 */
function whereDeTarea(filtros?: ReportFilters): Prisma.TaskWhereInput {
  if (!filtros) return {};

  const where: Prisma.TaskWhereInput = {};

  if (filtros.from || filtros.to) {
    where.createdAt = {
      ...(filtros.from ? { gte: new Date(filtros.from) } : {}),
      ...(filtros.to ? { lte: new Date(filtros.to) } : {}),
    };
  }
  if (filtros.boardId) where.boardId = filtros.boardId;
  if (filtros.priority) where.priority = filtros.priority;
  /* `some` y no una igualdad: las dos son relaciones de muchos a muchos, y una
     tarea con tres responsables entra si **alguno** es el pedido. */
  if (filtros.assigneeId) where.assignees = { some: { userId: filtros.assigneeId } };
  if (filtros.labelId) where.labels = { some: { labelId: filtros.labelId } };

  return where;
}

/**
 * Las condiciones de los filtros sobre un alias de `tasks.tasks`, para el SQL
 * crudo. Devuelve una lista para que cada consulta las una donde le toque.
 *
 * ⚠️ **`Prisma.raw` con el alias, y aquí es seguro**: el alias es un literal
 * escrito en este archivo, nunca algo que venga de una petición. Los **valores**
 * van todos por interpolación normal, o sea como parámetros del prepared
 * statement. Si algún día el alias saliera de fuera, esto sería inyección.
 *
 * `fecha` es la columna que acota `from`/`to`, y va explícita porque no es la
 * misma en todos los informes (ver la tabla de arriba). Con `null`, el tramo no
 * se aplica: lo usa el flujo diario, que acota por la fecha del evento y no por
 * ninguna de la tarea.
 */
function condicionesDeTarea(
  filtros: ReportFilters | undefined,
  opciones: { alias: string; fecha: 'createdAt' | 'completedAt' | null },
): Prisma.Sql[] {
  if (!filtros) return [];

  const tabla = Prisma.raw(`"${opciones.alias}"`);
  const condiciones: Prisma.Sql[] = [];

  if (opciones.fecha) {
    const columna = Prisma.raw(`"${opciones.alias}"."${opciones.fecha}"`);
    if (filtros.from) condiciones.push(Prisma.sql`${columna} >= ${filtros.from}::timestamptz`);
    if (filtros.to) condiciones.push(Prisma.sql`${columna} <= ${filtros.to}::timestamptz`);
  }

  if (filtros.boardId) {
    condiciones.push(Prisma.sql`${tabla}."boardId" = ${filtros.boardId}::text`);
  }
  if (filtros.priority) {
    /* A texto los dos lados: `priority` es un enum de Postgres y comparar un
       enum con un parámetro de texto da «operator does not exist». */
    condiciones.push(Prisma.sql`${tabla}."priority"::text = ${filtros.priority}::text`);
  }
  if (filtros.assigneeId) {
    condiciones.push(
      Prisma.sql`EXISTS (SELECT 1 FROM tasks.task_assignees fa
                          WHERE fa."taskId" = ${tabla}.id
                            AND fa."userId" = ${filtros.assigneeId}::text)`,
    );
  }
  if (filtros.labelId) {
    condiciones.push(
      Prisma.sql`EXISTS (SELECT 1 FROM tasks.task_labels fl
                          WHERE fl."taskId" = ${tabla}.id
                            AND fl."labelId" = ${filtros.labelId}::text)`,
    );
  }

  return condiciones;
}

/**
 * Las condiciones, ya pegadas a un `WHERE` que siempre tiene algo antes.
 *
 * Las ocho consultas empiezan por `WHERE t."projectId" = …`, así que lo que hace
 * falta es un `AND …` o nada. Sale de aquí y no de un `if` en cada sitio.
 */
function andDeTarea(
  filtros: ReportFilters | undefined,
  opciones: { alias: string; fecha: 'createdAt' | 'completedAt' | null },
): Prisma.Sql {
  const condiciones = condicionesDeTarea(filtros, opciones);
  if (condiciones.length === 0) return Prisma.empty;
  return Prisma.sql` AND ${Prisma.join(condiciones, ' AND ')}`;
}

/**
 * Lo mismo para el historial, donde la fila **es un evento y no una tarea**.
 *
 * Dos cosas se resuelven sin salir de `task_events`: el tramo, que allí acota
 * por `occurredAt` —cuándo pasó, que es lo que mide este informe— y el tablero,
 * porque el evento también guarda `boardId`.
 *
 * El resto —responsable, etiqueta, prioridad— son propiedades de la **tarea
 * actual**, no del evento, así que van por un `EXISTS` contra `tasks.tasks`.
 *
 * ⚠️ Y eso significa que filtrar el flujo por responsable enseña el historial de
 * las tareas que **hoy** tiene esa persona, no el de lo que era suyo entonces.
 * No hay otra lectura posible: `task_events` no guarda los responsables de cada
 * momento. Es la misma limitación que tiene la prioridad, y se dice aquí porque
 * el gráfico no puede decirla.
 */
function andDeEvento(filtros: ReportFilters | undefined, alias: string): Prisma.Sql {
  if (!filtros) return Prisma.empty;

  const evento = Prisma.raw(`"${alias}"`);
  const condiciones: Prisma.Sql[] = [];

  if (filtros.from)
    condiciones.push(Prisma.sql`${evento}."occurredAt" >= ${filtros.from}::timestamptz`);
  if (filtros.to)
    condiciones.push(Prisma.sql`${evento}."occurredAt" <= ${filtros.to}::timestamptz`);
  if (filtros.boardId) condiciones.push(Prisma.sql`${evento}."boardId" = ${filtros.boardId}::text`);

  /* Sin el tramo ni el tablero, que ya se resolvieron sobre el evento. */
  const deLaTarea = condicionesDeTarea(
    { assigneeId: filtros.assigneeId, labelId: filtros.labelId, priority: filtros.priority },
    { alias: 'ft', fecha: null },
  );
  if (deLaTarea.length > 0) {
    condiciones.push(
      Prisma.sql`EXISTS (SELECT 1 FROM tasks.tasks ft
                          WHERE ft.id = ${evento}."taskId"
                            AND ${Prisma.join(deLaTarea, ' AND ')})`,
    );
  }

  if (condiciones.length === 0) return Prisma.empty;
  return Prisma.sql` AND ${Prisma.join(condiciones, ' AND ')}`;
}

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
  async snapshot(projectId: string, filtros?: ReportFilters) {
    /* Una sola vez: los cinco `where` de abajo son el mismo más el proyecto. */
    const deLaTarea = { projectId, ...whereDeTarea(filtros) };

    const [byPriority, byColumn, byLabel, byAssignee, totals] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['priority'],
        where: deLaTarea,
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['columnId'],
        where: deLaTarea,
        _count: { _all: true },
      }),
      /* Las etiquetas cuelgan de la tarea por una tabla puente, así que se
         agrupan sobre ella acotando por las tareas del proyecto.

         ⚠️ Con `labelId` puesto esto devuelve **una sola fila**, y es correcto:
         se preguntó por una etiqueta. Lo que no puede hacer quien lo pinte es
         leerlo como «el proyecto solo tiene una etiqueta». */
      this.prisma.taskLabel.groupBy({
        by: ['labelId'],
        where: { task: deLaTarea },
        _count: { _all: true },
      }),
      this.prisma.taskAssignee.groupBy({
        by: ['userId'],
        where: { task: deLaTarea },
        _count: { _all: true },
      }),
      this.totals(projectId, filtros),
    ]);

    return {
      byPriority: byPriority.map((row) => ({ priority: row.priority, count: row._count._all })),
      byColumn: byColumn.map((row) => ({ columnId: row.columnId, count: row._count._all })),
      byLabel: byLabel.map((row) => ({ labelId: row.labelId, count: row._count._all })),
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
  private async totals(projectId: string, filtros?: ReportFilters) {
    const ahora = new Date();

    /* ⚠️ Los filtros acotan por `createdAt`, nunca por `completedAt`: tres de
       los siete contadores de aquí abajo ya usan esa columna para distinguir
       cerrada de abierta, y un filtro sobre ella los dejaría contando otra cosa
       —sin error, con un número plausible—. Ver `whereDeTarea`. */
    const deLaTarea = { projectId, ...whereDeTarea(filtros) };

    const [
      total,
      completed,
      overdue,
      unassigned,
      checklistItems,
      checklistDone,
      eventosSinteticos,
    ] = await Promise.all([
      this.prisma.task.count({ where: deLaTarea }),
      this.prisma.task.count({ where: { ...deLaTarea, completedAt: { not: null } } }),
      /* Vencidas: con fecha pasada y **sin cerrar**. Una tarea entregada no
         vence, que es la misma regla que ya aplica la tarjeta del tablero. */
      this.prisma.task.count({
        where: { ...deLaTarea, completedAt: null, dueDate: { lt: ahora } },
      }),
      /* ⚠️ `assignees: { none: {} }` pisa el `some` que pondría un filtro por
         responsable, y tiene que pisarlo: «sin asignar» y «de fulano» son
         incompatibles, y la respuesta correcta a las dos a la vez es cero. Lo
         es: `none` gana y el conteo sale vacío. */
      this.prisma.task.count({ where: { ...deLaTarea, assignees: { none: {} } } }),
      this.prisma.checklist.count({ where: { task: deLaTarea } }),
      this.prisma.checklist.count({ where: { task: deLaTarea, completed: true } }),
      /* Para que la pantalla pueda decir «esto es historial fabricado». No se
         filtra: es una propiedad del proyecto, no de las tareas que se miren. */
      this.prisma.taskEvent.count({ where: { projectId, actorId: ACTOR_SINTETICO } }),
    ]);

    return {
      total,
      completed,
      overdue,
      unassigned,
      checklistItems,
      checklistDone,
      eventosSinteticos,
    };
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
  async cycleTimes(projectId: string, filtros?: ReportFilters) {
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
         ${andDeTarea(filtros, { alias: 't', fecha: 'completedAt' })}
       GROUP BY t.id, t."completedAt", t."createdAt"
       ORDER BY t."completedAt"
    `;

    const horas = (desde: Date, hasta: Date) => (hasta.getTime() - desde.getTime()) / 3_600_000;

    return rows.map((row) => ({
      taskId: row.taskId,
      completedAt: row.completedAt,
      leadHours: horas(row.createdAt, row.completedAt),
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
  async dailyFlow(projectId: string, filtros?: ReportFilters) {
    return this.prisma.$queryRaw<
      { day: Date; columnId: string | null; entradas: number; salidas: number }[]
    >`
      WITH movimientos AS (
        SELECT date_trunc('day', e."occurredAt") AS day,
               e."toColumnId"   AS entra,
               e."fromColumnId" AS sale
          FROM tasks.task_events e
         WHERE e."projectId" = ${projectId}::text
           AND e.type IN ('CREATED', 'MOVED', 'DELETED')
           ${andDeEvento(filtros, 'e')}
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
   * Cuánto entró y cuánto se cerró **cada semana**.
   *
   * Es lo que hace falta para responder «¿cómo estuvo la semana?», que no se
   * puede sacar del flujo acumulado: aquel dice dónde está el trabajo cada día,
   * no cuánto se cerró en un tramo. Y sin la semana anterior al lado, un número
   * suelto —«5 tareas»— no dice si eso es bueno o malo.
   *
   * La semana es **la de Postgres**: `date_trunc('week')` empieza en lunes. Se
   * devuelven también las semanas en las que no se cerró nada, con cero: si se
   * omitieran, el ritmo saldría inflado y la comparación mentiría en cuanto
   * hubiera un festivo por medio.
   *
   * ⚠️ `cerradas` cuenta por `completedAt`, así que **solo ve lo cerrado desde
   * que existe el historial** (§25). `creadas` va por `createdAt` y sí es
   * completo. Quien lo pinte tiene que saber que no miden lo mismo.
   *
   * Van como subconsultas correlacionadas y no como dos `GROUP BY` cruzados
   * porque los dos agregados miran **columnas de fecha distintas**: unirlos
   * obligaría a un `FULL OUTER JOIN` por semana para ganar nada a esta escala.
   */
  async weeklyThroughput(projectId: string, semanas = 8, filtros?: ReportFilters) {
    return this.prisma.$queryRaw<{ semana: Date; cerradas: number; creadas: number }[]>`
      WITH s AS (
        SELECT generate_series(
                 /* ⚠️ El tramo, si viene, **es el eje** de este informe: aquí no
                    acota qué tareas se cuentan —eso lo hacen los otros filtros—
                    sino qué semanas salen. Sin él manda \`semanas\`, que sigue
                    siendo el caso normal. */
                 COALESCE(date_trunc('week', ${filtros?.from ?? null}::timestamptz),
                          date_trunc('week', now()) - make_interval(weeks => ${semanas - 1}::int)),
                 COALESCE(date_trunc('week', ${filtros?.to ?? null}::timestamptz),
                          date_trunc('week', now())),
                 interval '1 week'
               ) AS semana
      )
      SELECT s.semana,
             -- ::int por lo de siempre: COUNT(*) es bigint y un BigInt no se
             -- serializa a JSON, asi que reventaria al cruzar el TCP.
             (SELECT COUNT(*)::int
                FROM tasks.tasks t
               WHERE t."projectId" = ${projectId}::text
                 AND t."completedAt" >= s.semana
                 AND t."completedAt" <  s.semana + interval '1 week'
                 ${andDeTarea(filtros, { alias: 't', fecha: null })}) AS cerradas,
             (SELECT COUNT(*)::int
                FROM tasks.tasks t
               WHERE t."projectId" = ${projectId}::text
                 AND t."createdAt" >= s.semana
                 AND t."createdAt" <  s.semana + interval '1 week'
                 ${andDeTarea(filtros, { alias: 't', fecha: null })}) AS creadas
        FROM s
       ORDER BY s.semana
    `;
  }

  /**
   * Tareas abiertas que **llevan tiempo sin moverse de columna**.
   *
   * Es la respuesta a «¿hay algo bloqueado?», y el sistema no tiene ningún
   * estado «bloqueada»: se deduce del historial, que es justo para lo que se
   * empezó a capturar. Una tarea que lleva doce días en «En revisión» está
   * parada aunque nadie lo haya marcado en ninguna parte.
   *
   * ⚠️ **Se mira el último `CREATED` o `MOVED`, no `updatedAt`.** `updatedAt` lo
   * pisa cualquier `PATCH` —cambiar el título, añadir una etiqueta— y también la
   * cascada que reescribe el `status` al renombrar una columna: una tarea parada
   * desde hace un mes parecería recién tocada por haberle cambiado la prioridad.
   * Es el mismo motivo por el que el historial guarda `columnId` y no `status`
   * (§25.2).
   *
   * Sin ningún evento se cae a `createdAt`, y la fila lo dice en `sinHistorial`:
   * una tarea anterior a la captura no está necesariamente parada, simplemente no
   * sabemos cuándo se movió por última vez. Prometer lo contrario sería inventar.
   *
   * `columna` sale de `status`, que es el **nombre** de la columna donde está: se
   * puede leer en voz alta sin cruzarlo con projects-service.
   */
  async sinMovimiento(projectId: string, dias = 7, limite = 20, filtros?: ReportFilters) {
    return this.prisma.$queryRaw<
      {
        taskId: string;
        titulo: string;
        columna: string;
        columnId: string;
        diasParada: number;
        sinHistorial: boolean;
        vencida: boolean;
      }[]
    >`
      SELECT t.id                AS "taskId",
             t.title             AS titulo,
             t.status            AS columna,
             t."columnId"        AS "columnId",
             floor(
               EXTRACT(EPOCH FROM (now() - COALESCE(MAX(e."occurredAt"), t."createdAt"))) / 86400
             )::int              AS "diasParada",
             (MAX(e."occurredAt") IS NULL)                           AS "sinHistorial",
             (t."dueDate" IS NOT NULL AND t."dueDate" < now())       AS vencida
        FROM tasks.tasks t
        LEFT JOIN tasks.task_events e
               ON e."taskId" = t.id
              AND e.type IN ('CREATED', 'MOVED')
       WHERE t."projectId" = ${projectId}::text
         AND t."completedAt" IS NULL
         ${andDeTarea(filtros, { alias: 't', fecha: 'createdAt' })}
       GROUP BY t.id, t.title, t.status, t."columnId", t."createdAt", t."dueDate"
      HAVING floor(
               EXTRACT(EPOCH FROM (now() - COALESCE(MAX(e."occurredAt"), t."createdAt"))) / 86400
             ) >= ${dias}::int
       ORDER BY "diasParada" DESC
       LIMIT ${limite}::int
    `;
  }

  /**
   * Las tareas del proyecto, **en proyección mínima**, para el contexto del
   * asistente.
   *
   * Existe porque el briefing solo llevaba agregados —«5 sin asignar»— y con un
   * número no se puede actuar: pedirle «asigna a las que no tienen responsable»
   * era pedirle que adivinara ids que nunca había visto, y se negaba con razón.
   *
   * **No se reutiliza `task_find_all`.** Aquel devuelve la tarea entera con sus
   * relaciones —descripción, comentarios, adjuntos— y este contexto viaja
   * dentro de la instrucción de sistema en **cada turno** de la conversación.
   * Lo que aquí se deja fuera se deja de pagar en todos los mensajes.
   *
   * Va sin tope por decisión de producto: se prefiere que el asistente pueda
   * hablar de cualquier tarea a que acierte más barato. `LIMITE` está para
   * poder ponerle uno sin rehacer nada el día que un proyecto lo pida — a
   * partir de unos cientos de tareas abiertas esto se nota en latencia y en
   * cuota de Gemini.
   */
  async inventory(projectId: string) {
    const tareas = await this.prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        columnId: true,
        /**
         * ⚠️ **El tablero, que faltaba y era el fallo.**
         *
         * Un proyecto tiene varios espacios y cada espacio varios tableros, pero
         * el inventario solo llevaba `columnId`. El asistente veía una lista
         * plana de columnas de todos los tableros mezclados —cada uno con las
         * suyas numeradas 0,1,2,3— y no tenía forma de saber cuál era de cuál:
         * cuando le pedían mover o crear algo, acertaba solo si el proyecto
         * tenía un tablero. Con varios, siempre caía en el mismo.
         */
        boardId: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        assignees: { select: { userId: true } },
        labels: { select: { labelId: true } },
        /**
         * Los pasos, **con su id y su estado**.
         *
         * Sin esto, «en curso» era todo lo que el asistente sabía de una tarea a
         * medias: no distinguía una recién empezada de otra a la que le falta un
         * paso. Y sin los ids no podría proponer marcar ninguno.
         *
         * Se ordenan como en la pantalla para que «el siguiente paso» signifique
         * lo mismo en los dos sitios.
         */
        checklists: {
          select: { id: true, text: true, completed: true },
          orderBy: { order: 'asc' },
        },
        /* Solo cuántos hay, no el texto: los comentarios pueden ser largos y
           esto viaja en cada turno. El número basta para que note que hay
           conversación y lo diga. */
        _count: { select: { comments: true } },
      },
      /**
       * Las abiertas primero y las recientes antes: si algún día se baja el
       * tope, lo que se corte tiene que ser lo que menos falta hace.
       *
       * ⚠️ `nulls: 'first'` es obligatorio, no cosmético. En Postgres un
       * `ORDER BY ... ASC` pone los `NULL` **al final**, y aquí `completedAt`
       * nulo es precisamente «sigue abierta»: sin esto el `take` recortaría las
       * abiertas y dejaría dentro las cerradas, que es el orden contrario al
       * que hace falta.
       */
      orderBy: [{ completedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: LIMITE_INVENTARIO,
    });

    const armadas = tareas.map((tarea) => {
      const cerrada = tarea.completedAt !== null;

      /**
       * ⚠️ **Una tarea cerrada viaja en versión corta, y esto es la mitad del
       * coste del asistente.**
       *
       * Medido sobre el proyecto de demostración: 186 tareas ocupaban 83 000
       * caracteres del prompt —el 81 % de todo lo que se le manda al modelo en
       * **cada turno**— y de los 449 caracteres de una tarea solo 55 eran texto.
       * El resto son UUIDs y nombres de clave. Con 116 de esas 186 cerradas, la
       * mayor parte de ese gasto era historia.
       *
       * Lo que se conserva es lo que hace falta para **seguir pudiendo
       * señalarla**: su id, su título, su columna y que está cerrada. Con eso el
       * modelo puede nombrarla, contarla y proponer borrarla o reabrirla, que es
       * todo lo que se hace con una tarea terminada.
       *
       * Lo que se cae —encargados, etiquetas, prioridad, vencimiento,
       * descripción, pasos y comentarios— son justo los campos caros, y ninguno
       * cambia lo que se puede hacer con ella: repartir, clasificar, priorizar o
       * marcar pasos son gestos sobre trabajo vivo.
       *
       * El desglose por persona **no se resiente**: la carga y la experiencia
       * salen del bloque `personas`, que se calcula en SQL y no de contar aquí.
       */
      if (cerrada) {
        return {
          id: tarea.id,
          titulo: tarea.title,
          columna: tarea.status,
          columnId: tarea.columnId,
          boardId: tarea.boardId,
          cerrada: true,
        };
      }

      return {
        id: tarea.id,
        titulo: tarea.title,
        descripcion: recortar(tarea.description),
        columna: tarea.status,
        columnId: tarea.columnId,
        /* Sin nombre: tasks-service no conoce los tableros, viven en projects.
           Se lo pone `reports-service`, que es quien cruza las dos mitades. */
        boardId: tarea.boardId,
        prioridad: tarea.priority,
        /* Solo el día: la hora no la usa nadie para decidir y ocupa en cada turno. */
        vence: tarea.dueDate ? tarea.dueDate.toISOString().slice(0, 10) : null,
        cerrada: false,
        encargados: tarea.assignees.map((a) => a.userId),
        etiquetas: tarea.labels.map((l) => l.labelId),
        /* Solo si tiene: una tarea sin checklist no debe gastar dos claves vacías
           en cada turno de cada conversación. */
        ...(tarea.checklists.length > 0 && {
          pasos: tarea.checklists.map((paso) => ({
            id: paso.id,
            texto: paso.text,
            hecho: paso.completed,
          })),
        }),
        ...(tarea._count.comments > 0 && { comentarios: tarea._count.comments }),
      };
    });

    /**
     * El presupuesto, gastado en el orden en que vienen.
     *
     * Abiertas primero, y dentro de las cerradas las más recientes antes, así
     * que lo que se cae es lo que menos falta hace. Se mide sobre el JSON de
     * cada tarea porque es exactamente lo que va a ocupar en el prompt: contar
     * filas dejaría el coste oscilando según lleven checklist y encargados o no.
     */
    const dentro: typeof armadas = [];
    let gastado = 0;
    for (const tarea of armadas) {
      const cuesta = JSON.stringify(tarea).length;
      if (gastado + cuesta > INVENTARIO_MAX_CHARS) break;
      gastado += cuesta;
      dentro.push(tarea);
    }

    /**
     * ⚠️ **La forma cambia: antes era un array y ahora es un objeto.**
     *
     * Es lo que permite decir **cuántas faltan** sin que el modelo tenga que
     * deducirlo. Un recorte mudo es peor que no recortar: contestaría «no hay
     * ninguna más» con total seguridad sobre una lista que alguien le cortó por
     * detrás. Con `omitidas` puede decir que no las tiene todas delante.
     */
    return { tareas: dentro, omitidas: armadas.length - dentro.length };
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
  async byPerson(projectId: string, filtros?: ReportFilters) {
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
         ${andDeTarea(filtros, { alias: 't', fecha: 'createdAt' })}
       GROUP BY a."userId"
    `;
  }

  /**
   * Qué ha hecho cada persona, **desglosado por etiqueta**.
   *
   * Es lo que le falta a `byPerson` para poder recomendar a alguien: aquella
   * dice cuánto lleva cada cual, esta dice **de qué**. «Ha cerrado 5 tareas de
   * frontend» es un hecho sobre qué ha hecho alguien; sin la etiqueta solo queda
   * «ha cerrado 5 tareas», que no distingue a quién le encaja la siguiente.
   *
   * ⚠️ **No hay aquí ninguna medida de velocidad, y es deliberado.** La
   * `medianaHoras` está para poder decir «suele tardar 2 días en las de
   * frontend», que es contexto; no para ordenar a nadie. La regla de la sección
   * de Reportes se mantiene: se enseña reparto y experiencia, no clasificación.
   *
   * Solo salen las tareas **con etiqueta**: una sin etiquetar no dice de qué
   * trata, así que no cuenta como experiencia en nada. Con un tablero sin
   * etiquetas esto devuelve un array vacío, que es la respuesta correcta —quien
   * la lea tiene que decir que no hay base, no inventarse una.
   *
   * `medianaHoras` es de crear a cerrar, la misma unidad que en `byPerson`.
   */
  async byPersonAndLabel(projectId: string) {
    return this.prisma.$queryRaw<
      {
        userId: string;
        labelId: string;
        etiqueta: string;
        asignadas: number;
        cerradas: number;
        medianaHoras: number | null;
      }[]
    >`
      SELECT a."userId",
             l.id   AS "labelId",
             l.name AS etiqueta,
             -- ::int por lo mismo que en las otras dos: COUNT(*) es bigint y un
             -- BigInt no se serializa a JSON, así que reventaria al cruzar el
             -- TCP con un 500 sin ninguna pista. (Sin acentos graves aqui
             -- dentro: estamos en un template literal.)
             COUNT(*)::int                                            AS asignadas,
             COUNT(*) FILTER (WHERE t."completedAt" IS NOT NULL)::int AS cerradas,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (t."completedAt" - t."createdAt")) / 3600
             ) FILTER (WHERE t."completedAt" IS NOT NULL)             AS "medianaHoras"
        FROM tasks.task_assignees a
        JOIN tasks.tasks t        ON t.id = a."taskId"
        JOIN tasks.task_labels tl ON tl."taskId" = t.id
        JOIN tasks.labels l       ON l.id = tl."labelId"
       WHERE t."projectId" = ${projectId}::text
       GROUP BY a."userId", l.id, l.name
       ORDER BY cerradas DESC
    `;
  }
}
