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
    const [proyecto, columnas, snapshot, cycle, forecast, people, experiencia, etiquetas] =
      await Promise.all([
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
        this.ask<{ id: string; name: string; color: string }[]>(
          this.tasksClient,
          'label_find_all',
          { projectId },
        ),
      ]);

    const ordenadas = [...columnas].sort((a, b) => a.order - b.order);

    return {
      proyecto: {
        nombre: proyecto?.name ?? 'Proyecto',
        descripcion: proyecto?.description ?? null,
      },
      /* Con `order` y todo: la última columna suele ser la de cierre, y el
         modelo tiene que poder proponer una tarea nueva en la primera sin que
         se lo digamos por su nombre. */
      columnas: ordenadas.map((c) => ({
        id: c.id,
        nombre: c.name,
        color: c.color,
        orden: c.order,
      })),
      etiquetas: (etiquetas ?? []).map((l) => ({ id: l.id, nombre: l.name })),
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
        throughputDiario: (forecast as { throughputDiario?: { media: number } }).throughputDiario
          ?.media ?? null,
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
