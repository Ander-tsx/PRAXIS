import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { RedisService } from '../redis/redis.service';
import {
  acumularFlujo,
  evaluarSuficiencia,
  percentile,
  simularEntrega,
} from './statistics';

/** Ventana por defecto de los informes con historial. */
const DIAS_POR_DEFECTO = 60;

/**
 * Caché corta: un reporte no cambia de un segundo a otro, pero mirar uno viejo
 * después de mover una tarjeta se nota y desconcierta.
 */
const REPORT_TTL = 60;

@Injectable()
export class ReportsService {
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
   * Las columnas del proyecto, con su nombre y su color.
   *
   * Hacen falta en casi todos los informes: los datos de tasks vienen con
   * `columnId` y nada más, porque las columnas son de projects-service. Aquí es
   * donde se cruzan las dos mitades, que es literalmente para lo que existe este
   * servicio.
   */
  private async columnas(projectId: string) {
    const project = await this.ask<{
      workspaces?: { boards?: { columns?: { id: string; name: string; color: string; order: number }[] }[] }[];
    }>(this.projectsClient, 'project_find_one', { id: projectId });

    return (project?.workspaces ?? [])
      .flatMap((ws) => ws.boards ?? [])
      .flatMap((board) => board.columns ?? []);
  }

  /**
   * Instantánea del proyecto.
   *
   * **El único informe que no necesita historial**, y por eso el que enseña algo
   * real desde el primer día mientras el resto se acumula.
   */
  async snapshot(projectId: string) {
    return this.cached(`reports:${projectId}:snapshot`, async () => {
      const [stats, columns] = await Promise.all([
        this.ask<any>(this.tasksClient, 'task_stats_snapshot', { projectId }),
        this.columnas(projectId),
      ]);

      const porId = new Map(columns.map((c) => [c.id, c]));

      return {
        ...stats,
        /* Se le pone nombre y color a cada columna aquí: tasks-service no los
           conoce y el frontend no tiene por qué volver a pedirlos. */
        byColumn: stats.byColumn
          .map((row: { columnId: string; count: number }) => ({
            ...row,
            name:  porId.get(row.columnId)?.name ?? 'Columna eliminada',
            color: porId.get(row.columnId)?.color ?? null,
            order: porId.get(row.columnId)?.order ?? 999,
          }))
          .sort((a: { order: number }, b: { order: number }) => a.order - b.order),
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
  async cycleTime(projectId: string, dias = DIAS_POR_DEFECTO) {
    return this.cached(`reports:${projectId}:cycle:${dias}`, async () => {
      const desde = new Date(Date.now() - dias * 86_400_000);

      const muestras = await this.ask<
        { taskId: string; completedAt: string; leadHours: number; cycleHours: number | null }[]
      >(this.tasksClient, 'task_stats_cycle', { projectId, from: desde.toISOString() });

      const lead = muestras.map((m) => m.leadHours);
      const cycle = muestras
        .map((m) => m.cycleHours)
        .filter((h): h is number => h !== null);

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
  async flow(projectId: string, dias = DIAS_POR_DEFECTO) {
    return this.cached(`reports:${projectId}:flow:${dias}`, async () => {
      const desde = new Date(Date.now() - dias * 86_400_000);

      const [filas, columns] = await Promise.all([
        this.ask<{ day: string; columnId: string | null; entradas: number; salidas: number }[]>(
          this.tasksClient,
          'task_stats_flow',
          { projectId, from: desde.toISOString() },
        ),
        this.columnas(projectId),
      ]);

      const ordenadas = [...columns].sort((a, b) => a.order - b.order);

      const serie = acumularFlujo(
        filas.map((f) => ({ ...f, day: new Date(f.day) })),
        ordenadas.map((c) => c.id),
      );

      return {
        columnas: ordenadas.map((c) => ({ id: c.id, name: c.name, color: c.color })),
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
  async forecast(projectId: string, dias = DIAS_POR_DEFECTO) {
    return this.cached(`reports:${projectId}:forecast:${dias}`, async () => {
      const desde = new Date(Date.now() - dias * 86_400_000);

      const [muestras, snapshot] = await Promise.all([
        this.ask<{ completedAt: string }[]>(this.tasksClient, 'task_stats_cycle', {
          projectId,
          from: desde.toISOString(),
        }),
        this.ask<{ total: number; completed: number }>(
          this.tasksClient,
          'task_stats_snapshot',
          { projectId },
        ),
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
    });
  }

  /** Carga y flujo por persona. La ruta que lo expone pide `canViewReports`. */
  async people(projectId: string) {
    return this.cached(`reports:${projectId}:people`, async () => {
      return this.ask<
        {
          userId: string;
          abiertas: number;
          cerradas: number;
          vencidas: number;
          medianaHoras: number | null;
        }[]
      >(this.tasksClient, 'task_stats_people', { projectId });
    });
  }
}
