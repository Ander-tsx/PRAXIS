import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { type ReportFilters, claveDeFiltros, leerCruce } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

import { RedisService } from '../redis/redis.service';
import { acumularFlujo, evaluarSuficiencia, percentile, simularEntrega } from './statistics';

/** Ventana por defecto de los informes con historial. */
const DIAS_POR_DEFECTO = 60;

/**
 * Caché corta: un reporte no cambia de un segundo a otro, pero mirar uno viejo
 * después de mover una tarjeta se nota y desconcierta.
 */
const REPORT_TTL = 60;

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);
  private readonly tasksClient: ClientProxy;
  private readonly projectsClient: ClientProxy;

  /**
   * Los clientes se crean aquí y no con `ClientsModule`, siguiendo el patrón que
   * ya usa `tasks.service.ts` para hablar con projects.
   */
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.tasksClient = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: {
        host: this.config.get<string>('TASKS_SERVICE_HOST'),
        port: this.config.get<number>('TASKS_SERVICE_PORT'),
      },
    });
    this.projectsClient = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: {
        host: this.config.get<string>('PROJECTS_SERVICE_HOST'),
        port: this.config.get<number>('PROJECTS_SERVICE_PORT'),
      },
    });
  }

  private ask<T>(client: ClientProxy, cmd: string, payload: unknown): Promise<T> {
    return firstValueFrom(client.send<T>({ cmd }, payload));
  }

  private async cached<T>(key: string, produce: () => Promise<T>): Promise<T> {
    const hit = await this.redis.get<T>(key);
    if (hit) return hit;
    const fresh = await produce();
    await this.redis.set(key, fresh, REPORT_TTL);
    return fresh;
  }

  /**
   * Los filtros con la ventana ya metida dentro, que es lo que viaja a tasks.
   *
   * `days` y `from` son dos formas de decir «desde cuándo», y tasks-service no
   * tiene por qué conocer las dos: aquí se resuelven en una. **Manda `from`** —
   * quien escribió dos fechas hizo una pregunta concreta— y si no viene, se
   * calcula desde `dias`, que es el caso normal.
   *
   * 🔴 **Y esto NO puede entrar en la clave de caché.** El `from` que sale de
   * `dias` es «ahora menos sesenta días», o sea un instante distinto en cada
   * llamada: metido en la clave, ningún informe volvería a acertar en Redis
   * jamás, y el fallo se vería como que la caché «no funciona» sin que nada
   * fallara. La clave lleva `dias` —que sí es estable— y `claveDeFiltros` sobre
   * los filtros **tal como llegaron**.
   */
  private conVentana(dias: number, filtros?: ReportFilters): ReportFilters {
    return {
      ...filtros,
      from: filtros?.from ?? new Date(Date.now() - dias * 86_400_000).toISOString(),
    };
  }

  /**
   * Las columnas del proyecto, con su nombre y su color.
   *
   * Hacen falta en casi todos los informes: los datos de tasks vienen con
   * `columnId` y nada más, porque las columnas son de projects-service. Aquí es
   * donde se cruzan las dos mitades, que es literalmente para lo que existe este
   * servicio.
   */
  private async columnas(projectId: string) {
    const project = await this.ask<{
      workspaces?: {
        id: string;
        name: string;
        boards?: {
          id: string;
          name: string;
          columns?: { id: string; name: string; color: string; order: number }[];
        }[];
      }[];
    }>(this.projectsClient, 'project_find_one', { id: projectId });

    /**
     * ⚠️ **Cada columna sale sabiendo de qué tablero es, y antes no.**
     *
     * Esto hacía un doble `flatMap` que aplanaba espacios y tableros y devolvía
     * las columnas sueltas. Para pintar un gráfico daba igual —lo único que hace
     * falta es ponerle nombre y color a un `columnId`— pero el mismo helper
     * alimenta el briefing del asistente, y ahí la pérdida era el fallo: el
     * modelo recibía las columnas de todos los tableros mezcladas, cada tablero
     * con las suyas en orden 0,1,2,3, y «la de menor orden» acababa siendo una
     * cualquiera. Siempre trabajaba sobre el mismo tablero.
     *
     * Los informes siguen ignorando los campos nuevos, así que nada cambia para
     * ellos: agregan por proyecto entero, que es lo correcto y ya lo hacían.
     */
    return (project?.workspaces ?? []).flatMap((ws) =>
      (ws.boards ?? []).flatMap((board) =>
        (board.columns ?? []).map((columna) => ({
          ...columna,
          boardId: board.id,
          boardName: board.name,
          workspaceId: ws.id,
          workspaceName: ws.name,
        })),
      ),
    );
  }

  /**
   * Instantánea del proyecto.
   *
   * **El único informe que no necesita historial**, y por eso el que enseña algo
   * real desde el primer día mientras el resto se acumula.
   */
  async snapshot(projectId: string, filtros?: ReportFilters) {
    return this.cached(`reports:${projectId}:snapshot${claveDeFiltros(filtros)}`, async () => {
      const [stats, columns] = await Promise.all([
        this.ask<any>(this.tasksClient, 'task_stats_snapshot', { projectId, filtros }),
        this.columnas(projectId),
      ]);

      const porId = new Map(columns.map((c) => [c.id, c]));

      return {
        ...stats,
        /* Se le pone nombre y color a cada columna aquí: tasks-service no los
           conoce y el frontend no tiene por qué volver a pedirlos. */
        /**
         * ⚠️ **Cada fila dice de qué tablero es, y sin eso el gráfico mentía.**
         *
         * Los agregados siempre cubrieron el proyecto entero —se filtra por
         * `projectId`, no por tablero— pero esta lista salía como columnas
         * anónimas. En un proyecto con dos tableros que tengan una columna «Por
         * hacer» cada uno, el resultado eran **dos barras idénticas llamadas
         * igual**: se lee exactamente como si solo saliera un tablero, y no hay
         * forma de saber cuál es cuál.
         *
         * Se ordena por tablero y luego por el orden de la columna dentro de él,
         * que es como se leen en la pantalla del tablero.
         */
        byColumn: stats.byColumn
          .map((row: { columnId: string; count: number }) => ({
            ...row,
            name: porId.get(row.columnId)?.name ?? 'Columna eliminada',
            color: porId.get(row.columnId)?.color ?? null,
            order: porId.get(row.columnId)?.order ?? 999,
            board: porId.get(row.columnId)?.boardName ?? null,
            workspace: porId.get(row.columnId)?.workspaceName ?? null,
          }))
          .sort(
            (
              a: { order: number; board: string | null },
              b: { order: number; board: string | null },
            ) => (a.board ?? '').localeCompare(b.board ?? '') || a.order - b.order,
          ),
      };
    });
  }

  /**
   * Tiempos de ciclo y de entrega, en percentiles.
   *
   * Devuelve además **todas** las tareas cerradas con su tiempo, para poder
   * pintar la nube de puntos: un percentil solo dice dónde está la línea, y la
   * nube enseña la dispersión, que suele ser la información útil.
   */
  async cycleTime(projectId: string, dias = DIAS_POR_DEFECTO, filtros?: ReportFilters) {
    return this.cached(`reports:${projectId}:cycle:${dias}${claveDeFiltros(filtros)}`, async () => {
      const muestras = await this.ask<
        { taskId: string; completedAt: string; leadHours: number; cycleHours: number | null }[]
      >(this.tasksClient, 'task_stats_cycle', {
        projectId,
        filtros: this.conVentana(dias, filtros),
      });

      const lead = muestras.map((m) => m.leadHours);
      const cycle = muestras.map((m) => m.cycleHours).filter((h): h is number => h !== null);

      return {
        suficiencia: evaluarSuficiencia(muestras.length, dias),
        muestras,
        lead: {
          p50: percentile(lead, 0.5),
          p85: percentile(lead, 0.85),
        },
        /* Puede haber menos muestras de ciclo que de entrega: una tarea creada
           directamente en la columna de cierre nunca se movió, y no tiene
           tiempo de ciclo. Se dice cuántas son en vez de rellenar con ceros. */
        cycle: {
          p50: percentile(cycle, 0.5),
          p85: percentile(cycle, 0.85),
          muestrasConMovimiento: cycle.length,
        },
      };
    });
  }

  /**
   * Diagrama de flujo acumulado: cuántas tareas hay en cada columna cada día.
   */
  async flow(projectId: string, dias = DIAS_POR_DEFECTO, filtros?: ReportFilters) {
    return this.cached(`reports:${projectId}:flow:${dias}${claveDeFiltros(filtros)}`, async () => {
      const [filas, columns] = await Promise.all([
        this.ask<{ day: string; columnId: string | null; entradas: number; salidas: number }[]>(
          this.tasksClient,
          'task_stats_flow',
          { projectId, filtros: this.conVentana(dias, filtros) },
        ),
        this.columnas(projectId),
      ]);

      const ordenadas = [...columns].sort((a, b) => a.order - b.order);

      const serie = acumularFlujo(
        filas.map((f) => ({ ...f, day: new Date(f.day) })),
        ordenadas.map((c) => c.id),
      );

      return {
        /* Con su tablero, por lo mismo que la instantánea: dos bandas llamadas
           «Por hacer» son dos columnas distintas de dos tableros distintos, y la
           leyenda tiene que poder decirlo. */
        columnas: ordenadas.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          board: c.boardName,
        })),
        serie,
      };
    });
  }

  /**
   * Cuándo estaría vacío el tablero, por simulación.
   *
   * Si no hay historial suficiente **no devuelve una predicción**: devuelve
   * cuánto falta para poder hacerla. Ver `evaluarSuficiencia`.
   */
  async forecast(projectId: string, dias = DIAS_POR_DEFECTO, filtros?: ReportFilters) {
    return this.cached(
      `reports:${projectId}:forecast:${dias}${claveDeFiltros(filtros)}`,
      async () => {
        const conVentana = this.conVentana(dias, filtros);
        /* El principio de la ventana, ya resuelto: hace falta aquí abajo para
         rellenar los días de cero, y tiene que ser **el mismo** que el que se
         mandó a tasks o el ritmo saldría dividido entre otro número de días. */
        const desde = new Date(conVentana.from as string);

        const [muestras, snapshot] = await Promise.all([
          this.ask<{ completedAt: string }[]>(this.tasksClient, 'task_stats_cycle', {
            projectId,
            filtros: conVentana,
          }),
          /* ⚠️ Aquí van los filtros **sin** la ventana: `pendientes` es cuánto
           queda por hacer ahora, no cuánto entró en la ventana. Con la ventana
           puesta, un proyecto viejo con trabajo antiguo pendiente predeciría que
           está a punto de terminar. */
          this.ask<{ total: number; completed: number }>(this.tasksClient, 'task_stats_snapshot', {
            projectId,
            filtros,
          }),
        ]);

        const suficiencia = evaluarSuficiencia(muestras.length, dias);
        const pendientes = snapshot.total - snapshot.completed;

        if (!suficiencia.suficiente) {
          return { suficiencia, pendientes, prediccion: null };
        }

        /* Cierres por día, incluidos **los días de cero**: si se omitieran, el
         ritmo saldría inflado —solo se promediarían los días buenos— y la
         predicción sería sistemáticamente optimista. */
        const porDia = new Map<string, number>();
        for (let i = 0; i < dias; i++) {
          porDia.set(new Date(desde.getTime() + i * 86_400_000).toISOString().slice(0, 10), 0);
        }
        for (const muestra of muestras) {
          const dia = muestra.completedAt.slice(0, 10);
          if (porDia.has(dia)) porDia.set(dia, porDia.get(dia)! + 1);
        }

        return {
          suficiencia,
          pendientes,
          throughputDiario: {
            media: [...porDia.values()].reduce((a, b) => a + b, 0) / porDia.size,
          },
          prediccion: simularEntrega({
            throughputDiario: [...porDia.values()],
            pendientes,
          }),
        };
      },
    );
  }

  /**
   * Cómo fue **la semana**, con la anterior al lado.
   *
   * Un número suelto —«5 cerradas»— no dice si eso está bien. La comparación es
   * el informe entero: sin ella, quien pregunta «¿cómo estuvo la semana?» se
   * queda igual que antes de preguntar.
   *
   * ⚠️ **La semana en curso está a medias.** Un lunes por la mañana la
   * comparación con la semana pasada completa siempre sale catastrófica, así que
   * viaja `diasTranscurridos` y el ritmo diario de las dos: quien lo lea puede
   * comparar ritmos en vez de totales, que es lo honesto. La variación se calcula
   * igualmente sobre los totales porque es lo que la gente espera ver, pero nunca
   * se enseña sola.
   *
   * `variacion` es `null` cuando la semana pasada fue de cero: dividir entre cero
   * daría «infinito por ciento», y «se pasó de 0 a 3» ya se dice con los totales.
   */
  async weekly(projectId: string, semanas = 8, filtros?: ReportFilters) {
    return this.cached(
      `reports:${projectId}:weekly:${semanas}${claveDeFiltros(filtros)}`,
      async () => {
        /* Sin `conVentana`: aquí el tramo **es el eje** —qué semanas salen— y no
         una ventana de historial que haya que rellenar desde `semanas`. Ver
         `weeklyThroughput`. */
        const filas = await this.ask<{ semana: string; cerradas: number; creadas: number }[]>(
          this.tasksClient,
          'task_stats_weekly',
          { projectId, semanas, filtros },
        );

        const serie = filas.map((fila) => ({
          semana: new Date(fila.semana).toISOString().slice(0, 10),
          cerradas: fila.cerradas,
          creadas: fila.creadas,
        }));

        const actual = serie[serie.length - 1] ?? { semana: '', cerradas: 0, creadas: 0 };
        const anterior = serie[serie.length - 2] ?? { semana: '', cerradas: 0, creadas: 0 };

        /* Lunes = 1 … domingo = 7, como la semana de Postgres. */
        const hoy = new Date();
        const diasTranscurridos = ((hoy.getDay() + 6) % 7) + 1;

        return {
          semana: { ...actual, diasTranscurridos },
          anterior,
          variacion:
            anterior.cerradas > 0
              ? Math.round(((actual.cerradas - anterior.cerradas) / anterior.cerradas) * 100)
              : null,
          /* Ritmo por día transcurrido, que es lo que se puede comparar con una
           semana entera sin que la comparación mienta. */
          ritmoDiario: {
            semana: Number((actual.cerradas / diasTranscurridos).toFixed(2)),
            anterior: Number((anterior.cerradas / 7).toFixed(2)),
          },
          serie,
        };
      },
    );
  }

  /**
   * Lo que está **parado**: abiertas que llevan días sin cambiar de columna.
   *
   * No hay ningún estado «bloqueada» en el modelo y no se inventa uno: se
   * deduce del historial, que es exactamente para lo que se empezó a capturar.
   * Una tarea que lleva doce días en «En revisión» está parada aunque nadie la
   * haya marcado.
   *
   * `dias` es el umbral, no un dato del dominio: siete días es una semana entera
   * sin que se mueva, y quien pregunte otra cosa lo cambia por query.
   *
   * ⚠️ Las que salen con `sinHistorial: true` **no son necesariamente antiguas**:
   * son anteriores a la captura de eventos, así que lo que se cuenta es su edad,
   * no su parón. Se marcan para poder decirlo en vez de acusarlas de estar
   * paradas.
   */
  async blocked(projectId: string, dias = 7, filtros?: ReportFilters) {
    return this.cached(
      `reports:${projectId}:blocked:${dias}${claveDeFiltros(filtros)}`,
      async () => {
        const [tareas, columns] = await Promise.all([
          this.ask<
            {
              taskId: string;
              titulo: string;
              columna: string;
              columnId: string;
              diasParada: number;
              sinHistorial: boolean;
              vencida: boolean;
            }[]
            /* Los filtros **tal cual**, sin ventana: el `dias` de este informe es el
           umbral de parón, no desde cuándo se mira. */
          >(this.tasksClient, 'task_stats_stale', { projectId, dias, filtros }),
          this.columnas(projectId),
        ]);

        const porId = new Map(columns.map((c) => [c.id, c]));

        return {
          dias,
          total: tareas.length,
          /* Con el nombre actual de la columna, no con el `status` congelado en la
           tarea: si alguien renombró la columna, el nombre viejo despistaría. */
          tareas: tareas.map((tarea) => ({
            ...tarea,
            columna: porId.get(tarea.columnId)?.name ?? tarea.columna,
          })),
        };
      },
    );
  }

  /**
   * **Dos dimensiones a la vez.** El cruce que la sección no podía pedir.
   *
   * Todo lo demás de esta pantalla agrupa por una cosa. «De lo de frontend,
   * cuánto es urgente» necesita dos, y hasta ahora la única respuesta era poner
   * dos gráficos al lado y compararlos a ojo.
   *
   * Aquí solo se le pone **nombre** a lo que devolvió tasks-service: las
   * columnas viven en projects-service, así que un cruce por columna llega con
   * `columnId` y saldría como un UUID en el eje. Las personas las resuelve la
   * pantalla, que ya tiene el directorio del proyecto cargado.
   *
   * ⚠️ La suma de las celdas **no** es el total del proyecto cuando alguna
   * dimensión es de muchos a muchos. Viaja `tareas` al lado para que se pueda
   * decir en vez de disimularlo. Ver `StatsService.matrix`.
   */
  async matrix(
    projectId: string,
    agruparPor: string,
    partirPor: string,
    filtros?: ReportFilters,
  ) {
    return this.cached(
      `reports:${projectId}:matrix:${agruparPor}:${partirPor}${claveDeFiltros(filtros)}`,
      async () => {
        const necesitaColumnas = agruparPor === 'columna' || partirPor === 'columna';

        const [crudo, columns] = await Promise.all([
          this.ask<{
            agruparPor: string;
            partirPor: string;
            celdas: { a: string | null; b: string | null; count: number }[];
            tareas: number;
          }>(this.tasksClient, 'task_stats_matrix', {
            projectId,
            agruparPor,
            partirPor,
            filtros,
          }),
          /* Solo se pide el árbol del proyecto si alguna dimensión lo necesita:
             un cruce de etiqueta contra prioridad no tiene por qué pagar un
             salto a projects-service. */
          necesitaColumnas ? this.columnas(projectId) : Promise.resolve([]),
        ]);

        const porId = new Map(columns.map((c) => [c.id, c]));
        const nombrar = (dim: string, valor: string | null): string | null => {
          if (valor === null) return null;
          if (dim !== 'columna') return valor;
          return porId.get(valor)?.name ?? 'Columna eliminada';
        };

        return {
          ...crudo,
          celdas: crudo.celdas.map((celda) => ({
            ...celda,
            aNombre: nombrar(crudo.agruparPor, celda.a),
            bNombre: nombrar(crudo.partirPor, celda.b),
          })),
        };
      },
    );
  }

  /**
   * **Dónde espera el trabajo**: tiempo por columna.
   *
   * El informe de tiempos dice cuánto tarda una tarea de principio a fin. Este
   * dice en qué parte del tablero se va ese tiempo, que es lo único de los dos
   * sobre lo que se puede actuar: «doce días» no se arregla, «nueve de los doce
   * en revisión» sí.
   *
   * Trae dos mitades que hay que leer juntas y **no se pueden sumar**:
   *
   * - `terminadas`: las estancias que ya acabaron, en percentiles. Es la
   *   referencia — cuánto suele costar pasar por esa columna.
   * - `enCurso`: lo que llevan **ahora** las tareas abiertas donde están. Es el
   *   envejecimiento del trabajo en vuelo, y contra la mediana de al lado se
   *   lee solo: «lleva 3 días en una columna cuya mediana es 4 horas».
   *
   * ⚠️ `enCurso` es estrictamente mejor que `blocked` para la misma pregunta:
   * aquel usa un umbral fijo de días igual para todas las columnas, y una
   * columna de paso donde lo normal son dos horas no se puede juzgar con la
   * misma vara que una de revisión donde lo normal es una semana. `blocked` se
   * queda —es más simple de leer y no necesita la referencia histórica— pero
   * cuando las dos discrepen, manda esta.
   *
   * El cruce con las columnas es el de siempre: tasks-service devuelve
   * `columnId`, y el nombre, el color y el tablero salen de projects-service.
   */
  async columnTime(projectId: string, filtros?: ReportFilters) {
    return this.cached(`reports:${projectId}:column-time${claveDeFiltros(filtros)}`, async () => {
      const [crudo, columns] = await Promise.all([
        this.ask<{
          terminadas: {
            columnId: string;
            estancias: number;
            tareas: number;
            p50Horas: number | null;
            p85Horas: number | null;
            totalHoras: number | null;
          }[];
          enCurso: {
            columnId: string;
            tareas: number;
            p50Horas: number | null;
            maxHoras: number | null;
          }[];
        }>(this.tasksClient, 'task_stats_column_time', { projectId, filtros }),
        this.columnas(projectId),
      ]);

      const porId = new Map(columns.map((c) => [c.id, c]));
      const enCursoPorId = new Map(crudo.enCurso.map((fila) => [fila.columnId, fila]));

      /**
       * Una fila por columna **del tablero**, no por columna con estancias.
       *
       * Una columna por la que no ha pasado nada es un dato: significa que ese
       * paso no se usa. Si solo salieran las que tienen medidas, el gráfico
       * enseñaría un tablero que no existe y nadie podría notar la ausencia.
       */
      const filas = columns
        .map((columna) => {
          const terminada = crudo.terminadas.find((fila) => fila.columnId === columna.id);
          const curso = enCursoPorId.get(columna.id);
          return {
            columnId: columna.id,
            name: columna.name,
            color: columna.color,
            board: columna.boardName,
            order: columna.order,
            estancias: terminada?.estancias ?? 0,
            tareas: terminada?.tareas ?? 0,
            p50Horas: terminada?.p50Horas ?? null,
            p85Horas: terminada?.p85Horas ?? null,
            totalHoras: terminada?.totalHoras ?? null,
            enCurso: curso?.tareas ?? 0,
            enCursoP50Horas: curso?.p50Horas ?? null,
            enCursoMaxHoras: curso?.maxHoras ?? null,
          };
        })
        .sort((a, b) => (a.board ?? '').localeCompare(b.board ?? '') || a.order - b.order);

      /**
       * Las estancias en columnas que ya no existen no se tiran: se agrupan.
       *
       * Borrar una columna no borra el tiempo que el trabajo pasó en ella, y
       * descartarlo dejaría un total que no cuadra con la suma de las barras
       * sin decir por qué.
       */
      const huerfanas = crudo.terminadas.filter((fila) => !porId.has(fila.columnId));

      return {
        columnas: filas,
        huerfanas: huerfanas.reduce(
          (suma, fila) => ({
            estancias: suma.estancias + fila.estancias,
            horas: suma.horas + (fila.totalHoras ?? 0),
          }),
          { estancias: 0, horas: 0 },
        ),
      };
    });
  }

  /**
   * Retrabajo, rotación y volatilidad: **lo que ya estaba guardado y no se
   * miraba**.
   *
   * `TaskEvent` tiene ocho tipos y los informes usaban tres —`CREATED`, `MOVED`,
   * `COMPLETED`—. Este agrega los otros tres que dicen algo: `REOPENED` (volver
   * sobre lo hecho), `ASSIGNED`/`UNASSIGNED` (por cuántas manos pasa una tarea)
   * y `PRIORITY_CHANGED` (cuánto baila lo que se pide). **No captura nada
   * nuevo**: es la misma tabla leída con otra pregunta.
   *
   * ## ⚠️ Los tres empiezan donde empieza la captura, y hay que decirlo
   *
   * Un 4 % de retrabajo sobre dos semanas de historial en un proyecto de un año
   * no es un 4 %: es lo que se ha podido ver. La respuesta trae `desde` —el
   * primer evento del proyecto, sin filtrar— justo para que la pantalla lo diga
   * en vez de dejar que se lea como una medida completa. Es la misma regla del
   * recorte mudo, aplicada al principio de la serie en vez de al final.
   *
   * ## Y `porColumna` se cruza aquí, como en todos los demás
   *
   * tasks-service devuelve `columnId` y nada más: las columnas viven en
   * projects-service, y ponerles nombre y color es literalmente para lo que
   * existe este servicio.
   */
  async dynamics(projectId: string, filtros?: ReportFilters) {
    return this.cached(`reports:${projectId}:dynamics${claveDeFiltros(filtros)}`, async () => {
      const [crudo, columns] = await Promise.all([
        this.ask<{
          desde: string | null;
          retrabajo: {
            cierres: number;
            reaperturas: number;
            tareasCerradas: number;
            tareasReabiertas: number;
            porcentaje: number | null;
            porColumna: { columnId: string | null; count: number }[];
            top: { taskId: string; titulo: string; veces: number }[];
          };
          rotacion: {
            asignaciones: number;
            desasignaciones: number;
            tareasQueRotan: number;
            distribucion: { manos: number; tareas: number }[];
            top: { taskId: string; titulo: string; manos: number; movimientos: number }[];
          };
          volatilidad: {
            cambios: number;
            tareasVolatiles: number;
            distribucion: { cambios: number; tareas: number }[];
            matriz: { desde: string; hasta: string; count: number }[];
            top: { taskId: string; titulo: string; cambios: number }[];
          };
        }>(this.tasksClient, 'task_stats_dynamics', { projectId, filtros }),
        this.columnas(projectId),
      ]);

      const porId = new Map(columns.map((c) => [c.id, c]));

      return {
        ...crudo,
        retrabajo: {
          ...crudo.retrabajo,
          porColumna: crudo.retrabajo.porColumna.map((fila) => ({
            ...fila,
            /* Una reapertura hacia una columna que ya no existe sigue siendo una
               reapertura: se nombra y no se descarta, igual que en la
               instantánea. */
            name: fila.columnId
              ? (porId.get(fila.columnId)?.name ?? 'Columna eliminada')
              : 'Sin columna',
            color: fila.columnId ? (porId.get(fila.columnId)?.color ?? null) : null,
            board: fila.columnId ? (porId.get(fila.columnId)?.boardName ?? null) : null,
          })),
        },
      };
    });
  }

  /**
   * Varios agregados en una sola respuesta.
   *
   * ## Lo que se ahorra no es el cálculo, es el andamiaje
   *
   * Cada informe sigue calculándose igual y conservando su caché de 60 s: aquí
   * solo se lanzan juntos. Lo que desaparece son **seis viajes HTTP** desde el
   * servidor de Next hasta el gateway y —lo que de verdad pesaba— **seis
   * resoluciones de permisos idénticas**, porque `ProjectPermissionGuard`
   * pregunta a projects-service por TCP en cada petición que entra.
   *
   * ## ⚠️ Un informe que falla no se lleva a los demás
   *
   * `allSettled` y no `all`, y es la decisión de fondo de este método. La
   * pantalla pedía los siete con un `.catch(() => null)` cada uno, así que un
   * fallo en el cálculo de tiempos dejaba esa tarjeta vacía y las otras seis
   * intactas. Con `all`, agrupar las peticiones habría significado **agrupar los
   * fallos**: cambiar siete degradaciones independientes por un todo o nada, que
   * es peor de lo que había.
   *
   * Lo que falla vuelve como `null` —«se pidió y no se pudo»— y se registra,
   * porque un `null` silencioso en producción no se distingue de un proyecto sin
   * datos.
   */
  async bundle(
    projectId: string,
    incluir: string[],
    opciones: { days?: number; weeks?: number; filtros?: ReportFilters } = {},
  ): Promise<Record<string, unknown>> {
    const { days, weeks, filtros } = opciones;

    /* El mapa vive aquí y no en el gateway: es este servicio el que sabe qué
       argumentos acepta cada informe. */
    const calculos: Record<string, () => Promise<unknown>> = {
      snapshot: () => this.snapshot(projectId, filtros),
      flow: () => this.flow(projectId, days, filtros),
      'cycle-time': () => this.cycleTime(projectId, days, filtros),
      forecast: () => this.forecast(projectId, days, filtros),
      people: () => this.people(projectId, filtros),
      /**
       * ⚠️ **`blocked` NO recibe el `days` del paquete, y no es un olvido.**
       *
       * En los demás informes `days` es la **ventana de historial** que se mira
       * —60 por defecto—; en este es **cuántos días lleva parada** una tarea para
       * considerarla bloqueada, y su defecto son 7. Pasarle el mismo número
       * convertiría «lo que lleva una semana sin moverse» en «lo que lleva dos
       * meses», con el mismo nombre y sin que nadie lo notara: el informe seguiría
       * saliendo, solo que contestando a otra pregunta.
       *
       * Quien necesite otra ventana de estancamiento tiene su ruta suelta.
       */
      blocked: () => this.blocked(projectId, undefined, filtros),
      weekly: () => this.weekly(projectId, weeks, filtros),
      /* Sin `days`: no mira una ventana móvil sino todo el historial capturado,
         y quien quiera acotarlo tiene `from`/`to` como en el resto. */
      dynamics: () => this.dynamics(projectId, filtros),
      'column-time': () => this.columnTime(projectId, filtros),
    };

    /**
     * Los cruces no están en el mapa: llevan sus dos dimensiones dentro del
     * nombre (`matrix:etiqueta:prioridad`), así que se resuelven aparte.
     *
     * ⚠️ `leerCruce` **vuelve a validar** las dos dimensiones contra el conjunto
     * cerrado, aunque el DTO del gateway ya lo hiciera: este comando es
     * alcanzable por TCP sin pasar por él, igual que `incluir`.
     */
    for (const parte of incluir) {
      const cruce = leerCruce(parte);
      if (cruce) {
        calculos[parte] = () =>
          this.matrix(projectId, cruce.agruparPor, cruce.partirPor, filtros);
      }
    }

    const pedidos = incluir.filter((parte) => parte in calculos);

    const resultados = await Promise.allSettled(
      pedidos.map((parte) => (calculos[parte] as () => Promise<unknown>)()),
    );

    const paquete: Record<string, unknown> = {};
    pedidos.forEach((parte, i) => {
      const resultado = resultados[i];
      if (resultado?.status === 'fulfilled') {
        paquete[parte] = resultado.value;
        return;
      }
      this.log.warn(
        `El informe "${parte}" de ${projectId} fallo: ${
          (resultado as PromiseRejectedResult | undefined)?.reason
        }`,
      );
      paquete[parte] = null;
    });

    return paquete;
  }

  /**
   * El **briefing** que ve el asistente: todo lo que necesita, y nada más.
   *
   * ### Por qué vive aquí
   *
   * Es la misma operación que hace esta clase en los otros cinco informes
   * —pedir a tasks y projects, cruzar en memoria, devolver— así que ponerlo en
   * `assistant-service` habría duplicado el cruce de columnas y el de
   * suficiencia. `assistant` se queda con lo suyo: la cuota y hablar con
   * Gemini.
   *
   * ### Qué se le pasa, y qué no
   *
   * **Acotado a propósito.** Cada mensaje lo paga el usuario en cuota y el
   * equipo en dinero, así que no entran los títulos de todas las tareas, ni las
   * descripciones, ni los comentarios, ni los adjuntos. Entra lo que hace falta
   * para responder «cómo va esto» y «a quién le encaja lo siguiente»:
   *
   * - las columnas, que son el destino posible de una tarea nueva;
   * - las etiquetas, que son el vocabulario con el que clasificarla;
   * - los números ya calculados —instantánea, percentiles, predicción—;
   * - la carga actual de cada persona y su experiencia por etiqueta.
   *
   * ⚠️ **Los números salen ya calculados de aquí, y esa es la regla.** El modelo
   * no estima ni hace aritmética: explica y cita. Si le dejáramos calcular
   * diría «unos tres días» con total seguridad y sin ninguna base.
   *
   * `suficiencia` viaja entera **a propósito**: es lo que le permite decir «no
   * hay historial para responder a eso» en vez de improvisar una cifra. Sin
   * ella, un `null` en `prediccion` no se distingue de un error.
   *
   * ### ⚠️ `incluirPersonas` es la línea de `canViewReports`
   *
   * Todo lo desglosado **por persona** pide `canViewReports`, y un chat no es
   * una excepción a eso: si el bloque `personas` entrara siempre, un
   * «Colaborador» tendría en el asistente exactamente lo que la pantalla de
   * Reportes le esconde, y bastaría con preguntarlo en voz alta. Se filtra
   * **aquí, antes de armar el contexto**, y no en el prompt: pedirle al modelo
   * que no cuente algo que tiene delante no es un control de acceso.
   *
   * Lo decide el gateway, que es el único que sabe de permisos.
   *
   * No se cachea: sale de cinco informes que ya se cachean por su cuenta 60 s,
   * y una capa más solo añadiría una ventana en la que el chat contradice a los
   * gráficos que tiene al lado.
   */
  async briefing(projectId: string, incluirPersonas = false) {
    const [
      proyecto,
      columnas,
      snapshot,
      cycle,
      forecast,
      people,
      experiencia,
      etiquetas,
      semana,
      paradas,
      tareas,
    ] = await Promise.all([
      this.ask<{ name: string; description: string | null }>(
        this.projectsClient,
        'project_find_one',
        { id: projectId },
      ),
      this.columnas(projectId),
      this.snapshot(projectId),
      this.cycleTime(projectId),
      this.forecast(projectId),
      /* Sin `canViewReports` ni se piden: el mismo criterio que ya usa la
         pantalla de Reportes, que tampoco pide `/people` para descartarlo
         luego. Lo que no se trae no se puede filtrar mal más adelante. */
      incluirPersonas ? this.people(projectId) : Promise.resolve([]),
      incluirPersonas
        ? this.ask<
            {
              userId: string;
              labelId: string;
              etiqueta: string;
              asignadas: number;
              cerradas: number;
              medianaHoras: number | null;
            }[]
          >(this.tasksClient, 'task_stats_experience', { projectId })
        : Promise.resolve([]),
      this.ask<{ id: string; name: string; color: string }[]>(this.tasksClient, 'label_find_all', {
        projectId,
      }),
      /* Los dos informes que contestan «¿cómo estuvo la semana?» y «¿hay algo
         bloqueado?». Van en el briefing y además tienen ruta propia: el
         asistente los necesita aquí, y quien construya otro cliente —la skill
         de voz, sin ir más lejos— los necesita por HTTP. */
      this.weekly(projectId),
      this.blocked(projectId),
      /* El inventario: sin él, «asigna a las que no tienen responsable» era
         irresoluble — el briefing solo llevaba el número, y con un número no
         hay a qué tarea apuntar. */
      /**
       * ⚠️ **Ya no devuelve un array, devuelve `{ tareas, omitidas }`.**
       *
       * El inventario tiene un presupuesto en caracteres —viaja entero en cada
       * turno del asistente— y `omitidas` es cuántas se quedaron fuera. Sin ese
       * número el recorte sería mudo, y un modelo al que le cortan la lista por
       * detrás responde «no hay ninguna más» con total seguridad.
       */
      this.ask<{
        tareas: {
          id: string;
          titulo: string;
          columna: string;
          columnId: string;
          cerrada: boolean;
          /**
           * ⚠️ **De aquí abajo, todo opcional: una tarea cerrada no lo trae.**
           *
           * `task_inventory` manda las terminadas en versión corta —id, título,
           * columna y poco más— porque el inventario entero viaja en cada turno
           * y era el 81 % del prompt. Declararlos obligatorios aquí sería
           * escribir una forma que el emisor ya no cumple.
           */
          descripcion?: string | null;
          prioridad?: string;
          vence?: string | null;
          encargados?: string[];
          etiquetas?: string[];
          /* El tablero al que pertenece. Lo añade tasks-service; aquí se le
             pone el nombre, que es lo único que le sirve al modelo. */
          boardId: string;
        }[];
        omitidas: number;
      }>(this.tasksClient, 'task_inventory', { projectId }),
    ]);

    const ordenadas = [...columnas].sort((a, b) => a.order - b.order);

    /**
     * Los tableros del proyecto, **agrupados**, y no una lista plana de columnas.
     *
     * Esta es la corrección de fondo. Antes el briefing mandaba `columnas` a
     * secas, ordenadas por `orden`; con varios tableros eso mezcla las columnas
     * de todos —cada tablero numera las suyas desde 0— y el modelo no podía ni
     * saber que existía más de uno. El resultado era el que se reportó: creaba y
     * movía siempre en el mismo tablero, aunque le pidieras otro.
     *
     * Se manda la jerarquía real —espacio › tablero › columnas— porque es la que
     * usa la persona al hablar: «pásalo al tablero de diseño» solo se puede
     * resolver si «tablero de diseño» existe en el contexto.
     */
    const porTablero = new Map<
      string,
      {
        id: string;
        nombre: string;
        espacio: string;
        columnas: { id: string; nombre: string; color: string; orden: number }[];
      }
    >();
    for (const c of ordenadas) {
      const tablero = porTablero.get(c.boardId) ?? {
        id: c.boardId,
        nombre: c.boardName,
        espacio: c.workspaceName,
        columnas: [],
      };
      tablero.columnas.push({ id: c.id, nombre: c.name, color: c.color, orden: c.order });
      porTablero.set(c.boardId, tablero);
    }
    const tableros = [...porTablero.values()];
    /* `boardId` → nombre, para etiquetar el inventario sin recorrerlo dos veces. */
    const nombreDeTablero = new Map(tableros.map((t) => [t.id, t.nombre]));

    return {
      proyecto: {
        nombre: proyecto?.name ?? 'Proyecto',
        descripcion: proyecto?.description ?? null,
      },
      /**
       * ⚠️ **`tableros` es la fuente de verdad; `columnas` se mantiene por
       * compatibilidad.**
       *
       * Un assistant-service sin actualizar seguiría leyendo `columnas` y
       * funcionaría como hasta ahora —mal con varios tableros, bien con uno—
       * en vez de quedarse sin contexto y dejar de proponer nada. Cuando no
       * quede nadie leyéndola, se quita.
       */
      tableros,
      columnas: ordenadas.map((c) => ({
        id: c.id,
        nombre: c.name,
        color: c.color,
        orden: c.order,
        tableroId: c.boardId,
        tablero: c.boardName,
      })),
      etiquetas: (etiquetas ?? []).map((l) => ({ id: l.id, nombre: l.name })),
      /**
       * **El inventario de tareas, con sus ids.**
       *
       * Es lo que separa un asistente que comenta números de uno que puede
       * actuar sobre el trabajo. Antes el contexto solo llevaba agregados
       * —«5 sin asignar», «12 en curso»— y con eso el modelo podía describir el
       * estado del proyecto pero no señalar ninguna tarea concreta: al pedirle
       * «asigna a las que no tienen responsable» respondía, correctamente, que
       * necesitaba ids que nadie le había dado.
       *
       * Va **entero, sin recortar por relevancia**: la decisión es que pueda
       * hablar de cualquier tarea del proyecto. El tope duro vive en
       * `LIMITE_INVENTARIO`, en tasks-service, y es un cortafuegos contra la
       * ventana del modelo, no un criterio de producto.
       *
       * ⚠️ Esto viaja en **cada turno** de la conversación, dentro de la
       * instrucción de sistema. Es, con diferencia, el bloque más caro del
       * briefing, y crece con el proyecto mientras el resto no.
       *
       * ⚠️ Cada tarea sale con el **nombre** de su tablero, no solo el id. Un
       * id no le dice nada al modelo al redactar («la he movido dentro de
       * a3f1-…»), y sin el nombre no puede responder a «¿qué hay en el tablero
       * de diseño?» aunque tenga los datos delante.
       */
      /**
       * ⚠️ **`boardId` no sale de aquí: sale su nombre y nada más.**
       *
       * Un UUID por tarea son 47 caracteres —con su clave— que el modelo no usa
       * para nada: nombra el tablero por su nombre, y para colocar algo dentro
       * usa el `columnId`, que ya identifica el tablero sin ambigüedad. En un
       * proyecto de 200 tareas eso son ~9 000 caracteres por turno pagados por
       * un dato que nadie lee.
       *
       * Y la descripción solo se rellena cuando la hay: las cerradas ya no la
       * traen, y un `""` por tarea es una clave más que no dice nada.
       */
      tareas: (tareas?.tareas ?? []).map(({ boardId, ...tarea }) => ({
        ...tarea,
        ...(tarea.descripcion ? { descripcion: tarea.descripcion } : {}),
        ...(nombreDeTablero.get(boardId) ? { tablero: nombreDeTablero.get(boardId) } : {}),
      })),
      /**
       * Cuántas tareas no caben en el inventario.
       *
       * Solo viaja **cuando hay alguna**: una clave a cero en cada turno de cada
       * conversación es exactamente el tipo de dato que este briefing lleva
       * evitando desde que se escribió. Y el prompt tiene una regla para leerla:
       * con esto encima de la mesa, «esas son todas» deja de ser una afirmación
       * que el modelo pueda hacer a ciegas.
       */
      ...((tareas?.omitidas ?? 0) > 0 ? { tareasOmitidas: tareas.omitidas } : {}),
      /**
       * El avance, **ya calculado aquí**.
       *
       * La regla de la sección es que el modelo no hace aritmética, y una
       * división es aritmética: pedirle «35 de 62» y esperar «56 %» funciona
       * hasta el día que no funciona, y un porcentaje mal contado sobre el
       * trabajo de un equipo se repite en una reunión antes de que nadie lo
       * compruebe. Se calcula donde se calculan los percentiles.
       *
       * Se dan **dos** medidas porque miden cosas distintas y las dos se usan:
       * `porCierre` cuenta lo que está en una columna de cierre —lo que se ve en
       * el tablero, y funciona desde el primer día— y `porCompletado` cuenta lo
       * que tiene `completedAt`, que **solo existe desde que hay historial**
       * (§25). En un proyecto viejo la segunda sale más baja, y no porque se
       * haya avanzado menos.
       */
      avance: this.avance(snapshot),
      /**
       * La semana, con la anterior al lado y el ritmo diario de las dos.
       *
       * Responde «¿cómo estuvo la semana?» sin que el modelo tenga que restar
       * fechas, que es justo lo que hace mal.
       */
      semana,
      /**
       * Lo que está parado: abiertas sin cambiar de columna en 7 días o más.
       *
       * Sin esto, «¿hay tareas bloqueadas?» solo se podía contestar con «no
       * tengo ese dato», que era cierto y no servía de nada.
       */
      bloqueadas: {
        umbralDias: paradas.dias,
        total: paradas.total,
        tareas: paradas.tareas.map((tarea) => ({
          /* El id se descartaba aquí, y con él la posibilidad de hacer nada con
             lo que este bloque señala: el modelo podía decir «X lleva 12 días
             parada» y no proponer moverla ni reasignarla. Se conserva desde que
             existe `tareas`, para que las dos listas se puedan cruzar. */
          id: tarea.taskId,
          titulo: tarea.titulo,
          columna: tarea.columna,
          diasParada: tarea.diasParada,
          vencida: tarea.vencida,
          /* Anterior a la captura: lo que se cuenta es su edad, no su parón. */
          sinHistorial: tarea.sinHistorial,
        })),
      },
      instantanea: {
        total: snapshot.total,
        cerradas: snapshot.completed,
        vencidas: snapshot.overdue,
        sinAsignar: snapshot.unassigned,
        porColumna: snapshot.byColumn.map((c: { name: string; count: number }) => ({
          columna: c.name,
          tareas: c.count,
        })),
        porPrioridad: snapshot.byPriority,
        /* Que el modelo sepa que el historial es fabricado: si no, hablaría de
           «el equipo» como si midiera trabajo de gente real. */
        historialFabricado: snapshot.eventosSinteticos > 0,
      },
      tiempos: {
        suficiencia: cycle.suficiencia,
        entregaHoras: cycle.lead,
        cicloHoras: { p50: cycle.cycle.p50, p85: cycle.cycle.p85 },
      },
      prediccion: {
        suficiencia: forecast.suficiencia,
        pendientes: forecast.pendientes,
        throughputDiario:
          (forecast as { throughputDiario?: { media: number } }).throughputDiario?.media ?? null,
        dias: forecast.prediccion,
      },
      /**
       * La carga y la experiencia van **juntas y por persona**.
       *
       * Separadas, la recomendación cae en el fallo obvio: mandarle todo a quien
       * más sabe justo cuando ya tiene once tareas abiertas. Cruzarlas es lo que
       * convierte «Carlos sabe de frontend» en «Carlos sabe de frontend y ahora
       * mismo puede».
       *
       * Vacío si quien pregunta no tiene `canViewReports`.
       */
      personas: people.map((persona) => ({
        userId: persona.userId,
        abiertas: persona.abiertas,
        cerradas: persona.cerradas,
        vencidas: persona.vencidas,
        experiencia: (experiencia ?? [])
          .filter((fila) => fila.userId === persona.userId)
          .map((fila) => ({
            etiqueta: fila.etiqueta,
            labelId: fila.labelId,
            asignadas: fila.asignadas,
            cerradas: fila.cerradas,
            medianaHoras: fila.medianaHoras,
          })),
      })),
    };
  }

  /**
   * El porcentaje de avance, en las dos medidas que tienen sentido.
   *
   * **La aritmética se hace aquí y no en el modelo.** Es una división, sí, pero
   * es la cifra que se repite en una reunión antes de que a nadie se le ocurra
   * comprobarla, y el mismo argumento que impide dejarle estimar duraciones vale
   * para dejarle dividir.
   *
   * - `porCierre`: cuántas están en una columna **verde** (`DONE_COLUMN_COLOR`).
   *   Es lo que se ve mirando el tablero y **funciona desde el primer día**.
   * - `porCompletado`: cuántas tienen `completedAt`, que solo existe desde que se
   *   captura el historial. En un proyecto anterior a la captura sale más bajo, y
   *   no porque se haya avanzado menos.
   *
   * Con cero tareas el porcentaje es `null` y no `0`: un tablero vacío no está
   * al 0 % de nada, y un cero ahí se leería como «no habéis hecho nada».
   */
  private avance(snapshot: {
    total: number;
    completed: number;
    byColumn: { count: number; color: string | null }[];
  }) {
    const enCierre = snapshot.byColumn
      .filter((columna) => columna.color === 'success')
      .reduce((suma, columna) => suma + columna.count, 0);

    const porcentaje = (parte: number) =>
      snapshot.total > 0 ? Math.round((parte / snapshot.total) * 100) : null;

    return {
      total: snapshot.total,
      enColumnaDeCierre: enCierre,
      conFechaDeCierre: snapshot.completed,
      porCierre: porcentaje(enCierre),
      porCompletado: porcentaje(snapshot.completed),
    };
  }

  /** Carga y flujo por persona. La ruta que lo expone pide `canViewReports`. */
  /**
   * La cartera: una fila por proyecto, para saber en cuál entrar.
   *
   * Este servicio no hace aquí más que orquestar y cachear —el cálculo entero
   * son las dos consultas agrupadas de tasks-service— y aun así pasa por él en
   * vez de que el gateway hable directamente con tasks. Por dos motivos: la
   * caché de 60 s vive aquí y la aprovechan los siete informes ya, y el día que
   * la cartera necesite algo de projects-service —el estado administrativo del
   * proyecto, por ejemplo— este es el único de los tres que ve las dos mitades.
   *
   * ⚠️ **La clave lleva los proyectos ordenados.** El gateway los devuelve en el
   * orden del listado, que depende de `sortBy`: sin ordenarlos, la misma cartera
   * pedida dos veces generaría dos claves y la caché no acertaría nunca. Es el
   * mismo cuidado que en `claveDeFiltros`.
   *
   * ⚠️ Y **no** lleva el usuario: la respuesta depende solo del conjunto de
   * proyectos, no de quién pregunta. Dos personas con la misma cartera comparten
   * el resultado, que es correcto —lo que decide qué proyectos entran en la lista
   * ya pasó por el guard del gateway— y evita una entrada de caché por persona.
   */
  async portfolio(projectIds: string[], dias = 7) {
    const clave = `reports:portfolio:${[...projectIds].sort().join('.')}:${dias}`;
    return this.cached(clave, () =>
      this.ask<unknown[]>(this.tasksClient, 'task_stats_portfolio', { projectIds, dias }),
    );
  }

  async people(projectId: string, filtros?: ReportFilters) {
    return this.cached(`reports:${projectId}:people${claveDeFiltros(filtros)}`, async () => {
      return this.ask<
        {
          userId: string;
          abiertas: number;
          cerradas: number;
          vencidas: number;
          medianaHoras: number | null;
        }[]
      >(this.tasksClient, 'task_stats_people', { projectId, filtros });
    });
  }
}
