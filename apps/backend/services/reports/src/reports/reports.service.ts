import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
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
  async cycleTime(projectId: string, dias = DIAS_POR_DEFECTO) {
    return this.cached(`reports:${projectId}:cycle:${dias}`, async () => {
      const desde = new Date(Date.now() - dias * 86_400_000);

      const muestras = await this.ask<
        { taskId: string; completedAt: string; leadHours: number; cycleHours: number | null }[]
      >(this.tasksClient, 'task_stats_cycle', { projectId, from: desde.toISOString() });

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
  async forecast(projectId: string, dias = DIAS_POR_DEFECTO) {
    return this.cached(`reports:${projectId}:forecast:${dias}`, async () => {
      const desde = new Date(Date.now() - dias * 86_400_000);

      const [muestras, snapshot] = await Promise.all([
        this.ask<{ completedAt: string }[]>(this.tasksClient, 'task_stats_cycle', {
          projectId,
          from: desde.toISOString(),
        }),
        this.ask<{ total: number; completed: number }>(this.tasksClient, 'task_stats_snapshot', {
          projectId,
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
    });
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
  async weekly(projectId: string, semanas = 8) {
    return this.cached(`reports:${projectId}:weekly:${semanas}`, async () => {
      const filas = await this.ask<{ semana: string; cerradas: number; creadas: number }[]>(
        this.tasksClient,
        'task_stats_weekly',
        { projectId, semanas },
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
    });
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
  async blocked(projectId: string, dias = 7) {
    return this.cached(`reports:${projectId}:blocked:${dias}`, async () => {
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
        >(this.tasksClient, 'task_stats_stale', { projectId, dias }),
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
