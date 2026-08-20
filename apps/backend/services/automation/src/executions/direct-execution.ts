import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { AutomationActionType, AutomationTriggerType } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

import { PrismaService } from '../prisma/prisma.service';
import { triggerSpec } from '../rules/catalog';
import { type ActionContext, runAction } from './actions';
import { matchesAllConditions } from './rule-matcher';
import { type TaskShape, conContexto, diasDesde } from './task-context';

export type DirectActionResult<T = unknown> =
  | { status: 'SUCCEEDED'; attempts: number; value: T }
  | { status: 'FAILED'; attempts: number; error: { message: string } };

const safeError = (error: unknown) => ({
  message: (error instanceof Error ? error.message : String(error)).slice(0, 300),
});

export async function runWithOneRetry<T>(
  operation: () => Promise<T>,
  wait: () => Promise<void>,
): Promise<DirectActionResult<T>> {
  try {
    return { status: 'SUCCEEDED', attempts: 1, value: await operation() };
  } catch {
    await wait();
  }

  try {
    return { status: 'SUCCEEDED', attempts: 2, value: await operation() };
  } catch (error) {
    return { status: 'FAILED', attempts: 2, error: safeError(error) };
  }
}

export async function executeSequentially(
  actions: Array<() => Promise<unknown>>,
  wait: () => Promise<void>,
): Promise<DirectActionResult[]> {
  const results: DirectActionResult[] = [];
  for (const action of actions) results.push(await runWithOneRetry(action, wait));
  return results;
}

export type Rule = {
  id: string;
  projectId: string;
  name: string;
  version: number;
  createdBy: string;
  trigger: { type: string; config: Record<string, unknown> };
  conditions: Array<{ field: string; operator: string; value: unknown; position: number }>;
  actions: Array<{ type: string; config: Record<string, unknown>; position: number }>;
};

export type Candidate = {
  task: TaskShape;
  recipients: string[];
  context: Record<string, unknown>;
};

export type Project = {
  id: string;
  name?: string;
  ownerId: string;
  status?: string;
};

/**
 * Qué causa concreta atendió una ejecución.
 *
 * ⚠️ **La versión de la regla va dentro, y es lo que hace que editar una regla
 * la «reabra»**: cambiar el margen de aviso sube `version`, la clave cambia y la
 * misma tarea vuelve a ser candidata. Sin eso, corregir una regla que estaba mal
 * no habría servido de nada sobre lo ya visto.
 *
 * El origen también: un barrido y un evento sobre la misma tarea son dos causas
 * distintas, y colapsarlas haría que revisar a mano tapara al hecho que acaba
 * de ocurrir.
 */
export function executionCauseKey(
  rule: Pick<Rule, 'id' | 'version'>,
  candidate: { task: { id: string }; context: Record<string, unknown> },
  origen: 'manual' | 'event' = 'manual',
) {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(candidate.context))
    .digest('hex')
    .slice(0, 20);
  return `${origen}:${rule.version}:${candidate.task.id}:${fingerprint}`;
}

const waitBeforeRetry = () => new Promise<void>((resolve) => setTimeout(resolve, 250));

/**
 * Si el fallo es «esta causa ya estaba», y no otra cosa.
 *
 * P2002 es el código de Prisma para una restricción única violada. Aquí solo
 * hay una que pueda chocar —`@@unique([ruleId, causeKey])`— así que el código
 * basta; comprobar además el campo ataría esto al nombre del índice sin ganar
 * nada.
 */
function isDuplicateCause(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Cuántas veces puede una automatización tocar la misma tarea en una hora.
 *
 * 🔴 **Es el freno de un bucle, y hace falta desde que una acción escribe.** Una
 * regla que mueve una tarea produce un `task.moved.v1`, que despierta a los
 * disparadores de movimiento, que pueden volver a moverla. Dos reglas que se
 * empujan la una a la otra —«si llega a Revisión, muévela a Hecho» y «si llega a
 * Hecho y no tiene encargado, muévela a Revisión»— giran para siempre, y la
 * idempotencia por causa no las para: cada vuelta tiene un contexto distinto, así
 * que es una causa distinta de verdad.
 *
 * No hay forma barata de detectar el ciclo —el `causationId` no sobrevive al
 * salto por RPC— así que se pone un techo. No es correctitud, es un fusible: si
 * salta, la regla está mal escrita y el registro lo dice.
 */
const MAX_EJECUCIONES_POR_TAREA_HORA = 20;

@Injectable()
export class AutomationEngineService {
  private readonly log = new Logger(AutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /* ─── Barrido ───────────────────────────────────────────────────────────── */

  async reviewProject(projectId: string) {
    const [project, rules] = await Promise.all([
      firstValueFrom<Project>(
        this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId }),
      ),
      this.reglasHabilitadas(projectId),
    ]);

    if (!project) throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    if (project.status && project.status !== 'ACTIVE') {
      throw new RpcException({ statusCode: 403, message: 'El proyecto no está activo' });
    }

    let candidates = 0;
    let succeeded = 0;
    let failed = 0;
    /**
     * Por qué una candidata no acabó en acción, contado aparte.
     *
     * ⚠️ **«0 avisos» no significa nada sin esto.** El resumen decía cuántas
     * salieron bien y cuántas fallaron, y ahí se acababa: una revisión con
     * cuarenta candidatas y ninguna acción se leía exactamente igual tanto si
     * las condiciones no se cumplían —la regla está mal escrita— como si ya se
     * actuó ayer —todo va bien—. Dos situaciones opuestas, dos decisiones
     * opuestas de quien lo lee, y el mismo número.
     */
    let filtered = 0;
    let repeated = 0;

    /* Solo las de barrido: una regla reactiva no se «revisa», se atiende cuando
       ocurre su hecho. Antes las reactivas ni existían y no hacía falta. */
    const deBarrido = rules.filter((rule) => triggerSpec(rule.trigger.type)?.kind === 'sweep');

    for (const rule of deBarrido) {
      const encontradas = await this.candidatasDeBarrido(rule, project);
      candidates += encontradas.length;
      for (const candidate of encontradas) {
        const resultado = await this.ejecutar(rule, candidate, project, 'manual');
        if (resultado === 'SUCCEEDED') succeeded += 1;
        else if (resultado === 'FAILED') failed += 1;
        else if (resultado === 'REPEATED') repeated += 1;
        else filtered += 1;
      }
    }

    return {
      rules: deBarrido.length,
      candidates,
      succeeded,
      failed,
      filtered,
      repeated,
    };
  }

  /* ─── Reactivo ──────────────────────────────────────────────────────────── */

  /**
   * Atiende un hecho de dominio: busca las reglas que lo escuchan y las evalúa.
   *
   * Devuelve cuántas actuaron, para que quien consume el flujo pueda registrarlo
   * sin volver a preguntar.
   */
  async handleTaskEvent(evento: {
    type: string;
    projectId: string;
    subjectId: string;
    payload: Record<string, unknown>;
  }): Promise<{ evaluadas: number; ejecutadas: number }> {
    const reglas = (await this.reglasHabilitadas(evento.projectId)).filter((rule) => {
      const spec = triggerSpec(rule.trigger.type);
      return spec?.kind === 'reactive' && spec.eventType === evento.type;
    });
    if (reglas.length === 0) return { evaluadas: 0, ejecutadas: 0 };

    const project = await firstValueFrom<Project>(
      this.projectsClient.send({ cmd: 'project_find_one' }, { id: evento.projectId }),
    );
    /* Un proyecto suspendido no acepta escrituras ni de su dueño, así que
       tampoco de una regla suya. Un proyecto borrado responde 404 y aquí llega
       como nada: el hecho se da por atendido, porque no hay a qué atenderlo. */
    if (!project || (project.status && project.status !== 'ACTIVE')) {
      return { evaluadas: reglas.length, ejecutadas: 0 };
    }

    const task = await this.tarea(evento.subjectId);
    if (!task) return { evaluadas: reglas.length, ejecutadas: 0 };

    let ejecutadas = 0;
    for (const rule of reglas) {
      const candidate: Candidate = {
        task,
        recipients: (task.assignees ?? []).map((asignado) => asignado.userId),
        context: conContexto(task, this.extrasDelEvento(evento)),
      };
      const resultado = await this.ejecutar(rule, candidate, project, 'event');
      if (resultado === 'SUCCEEDED') ejecutadas += 1;
    }
    return { evaluadas: reglas.length, ejecutadas };
  }

  /**
   * Lo que aporta el hecho y no está en la tarea.
   *
   * ⚠️ **La columna de origen de un movimiento solo existe en el evento.** La
   * tarea ya está en la de destino cuando esto se lee, así que sin el payload no
   * hay forma de escribir «cuando salga de Por hacer».
   */
  private extrasDelEvento(evento: { type: string; payload: Record<string, unknown> }) {
    if (evento.type === 'task.moved.v1') {
      return {
        fromColumnId: evento.payload.fromColumnId ?? null,
        toColumnId: evento.payload.toColumnId ?? null,
      };
    }
    return {};
  }

  /* ─── El paso común ─────────────────────────────────────────────────────── */

  private async ejecutar(
    rule: Rule,
    candidate: Candidate,
    project: Project,
    origen: 'manual' | 'event',
  ): Promise<'SUCCEEDED' | 'FAILED' | 'FILTERED' | 'REPEATED'> {
    const matched = matchesAllConditions(rule.conditions, candidate.context);
    const causeKey = executionCauseKey(rule, candidate, origen);

    /**
     * 🔴 **Quien decide si esta causa ya se atendió es la base, no una lectura
     * previa.**
     *
     * Esto hacía un `findUnique` y, si no había nada, un `create`. Entre las dos
     * consultas cabe otra revisión entera: dos pestañas, un doble clic en
     * «Revisar ahora» o dos instancias del servicio, y las dos leen «no existe»,
     * las dos crean, y la segunda revienta contra `@@unique([ruleId, causeKey])`
     * con un P2002 que nadie capturaba. Por fuera: un 500 por pulsar un botón
     * dos veces seguidas.
     *
     * La restricción única **ya era el árbitro**; la lectura previa solo añadía
     * una carrera y una consulta por candidata.
     */
    let execution: { id: string };
    try {
      execution = await this.prisma.ruleExecution.create({
        data: {
          ruleId: rule.id,
          ruleVersion: rule.version,
          causeKey,
          triggerType: rule.trigger.type,
          subjectId: candidate.task.id,
          subjectTitle: candidate.task.title.slice(0, 200),
          ruleSnapshot: resumenDeRegla(rule) as never,
          conditionResult: { matched, context: candidate.context } as never,
          status: matched ? 'RUNNING' : 'SKIPPED',
          startedAt: new Date(),
          ...(!matched && { finishedAt: new Date() }),
        },
        select: { id: true },
      });
    } catch (error) {
      if (isDuplicateCause(error)) return 'REPEATED';
      throw error;
    }
    if (!matched) return 'FILTERED';

    /* El fusible del bucle. Se mira **después** de anotar la ejecución para que
       quede constancia de que se paró aquí, no un silencio. */
    if (await this.demasiadoReciente(candidate.task.id)) {
      await this.prisma.ruleExecution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          error: {
            message: `Freno de bucle: más de ${MAX_EJECUCIONES_POR_TAREA_HORA} automatizaciones sobre esta tarea en la última hora`,
          } as never,
          finishedAt: new Date(),
        },
      });
      this.log.warn(`automation_freno_de_bucle taskId=${candidate.task.id} ruleId=${rule.id}`);
      return 'FAILED';
    }

    const contexto: ActionContext = {
      projectId: project.id,
      triggerType: rule.trigger.type,
      projectName: project.name,
      projectOwnerId: project.ownerId,
      requesterId: rule.createdBy,
      task: candidate.task,
      recipients: candidate.recipients,
    };

    const operaciones = rule.actions.map(
      (action) => () =>
        runAction(action, contexto, { tasks: this.tasksClient, projects: this.projectsClient }),
    );
    const results = await executeSequentially(operaciones, waitBeforeRetry);
    const status = results.some((result) => result.status === 'FAILED') ? 'FAILED' : 'SUCCEEDED';

    await this.prisma.ruleExecution.update({
      where: { id: execution.id },
      data: { status, actionResults: results as never, finishedAt: new Date() },
    });

    if (status === 'FAILED') await this.pausarSiEsDePermisos(rule, results);
    return status;
  }

  /**
   * Pausa la regla si lo que falló fue el permiso de quien la escribió.
   *
   * ⚠️ **Un 403 aquí no es un fallo transitorio: es una regla que ya no puede
   * hacer lo que promete.** Reintentarla cada revisión llenaría la auditoría de
   * fallos idénticos y no arreglaría nada, porque lo que cambió es el rol de una
   * persona. Se pausa con el motivo escrito, que es lo que permite que la
   * pantalla lo explique en vez de enseñar una regla habilitada que no hace
   * nada.
   */
  private async pausarSiEsDePermisos(rule: Rule, results: DirectActionResult[]) {
    const dePermisos = results.some(
      (resultado) =>
        resultado.status === 'FAILED' && /forbidden|permiso|403/i.test(resultado.error.message),
    );
    if (!dePermisos) return;

    await this.prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        status: 'PAUSED_SYSTEM',
        pausedAt: new Date(),
        pauseReason:
          'Quien creó esta regla ya no tiene permiso para lo que hace. ' +
          'Revisa su rol o cambia las acciones, y vuelve a habilitarla.',
      },
    });
    this.log.warn(`automation_regla_pausada ruleId=${rule.id} motivo=permisos`);
  }

  private async demasiadoReciente(taskId: string): Promise<boolean> {
    const desde = new Date(Date.now() - 3_600_000);
    const cuantas = await this.prisma.ruleExecution.count({
      where: {
        subjectId: taskId,
        status: { in: ['SUCCEEDED', 'RUNNING'] },
        createdAt: { gte: desde },
      },
    });
    return cuantas > MAX_EJECUCIONES_POR_TAREA_HORA;
  }

  /* ─── Datos ─────────────────────────────────────────────────────────────── */

  private async reglasHabilitadas(projectId: string): Promise<Rule[]> {
    const reglas = await this.prisma.automationRule.findMany({
      where: { projectId, status: 'ENABLED' },
      include: {
        trigger: true,
        conditions: { orderBy: { position: 'asc' } },
        actions: { orderBy: { position: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    /* Una regla sin disparador no se puede evaluar. No debería existir —la
       relación se crea con la regla— pero una fila a medias no puede tumbar la
       revisión de las demás. */
    return reglas.filter((regla) => regla.trigger !== null) as unknown as Rule[];
  }

  private async tarea(taskId: string): Promise<TaskShape | null> {
    try {
      return await firstValueFrom<TaskShape>(
        this.tasksClient.send({ cmd: 'task_find_one' }, { id: taskId }),
      );
    } catch {
      /* Borrada entre que el hecho se emitió y se atiende. No es un fallo del
         sistema: es que ya no hay sobre qué actuar. */
      return null;
    }
  }

  async recent(projectId: string, limit = 20) {
    return this.prisma.ruleExecution.findMany({
      where: { rule: { projectId } },
      include: { rule: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
  }

  /* ─── Candidatas de cada disparador de barrido ──────────────────────────── */

  private async candidatasDeBarrido(rule: Rule, project: Project): Promise<Candidate[]> {
    const tareas = await firstValueFrom<TaskShape[]>(
      this.tasksClient.send({ cmd: 'task_find_by_project' }, { projectId: rule.projectId }),
    );
    const abiertas = (tareas ?? []).filter((tarea) => !tarea.completedAt);
    const ahora = new Date();

    const conEtiquetas = necesitaEtiquetas(rule);
    const preparar = async (tarea: TaskShape, extra: Record<string, unknown>) => {
      /* Las etiquetas no vienen en el listado del proyecto, así que solo se
         pide la tarea entera cuando la regla las usa de verdad: una condición
         sobre etiquetas o una acción que las toca. Pedirlas siempre sería una
         llamada por candidata para un dato que casi ninguna regla mira. */
      const completa = conEtiquetas ? ((await this.tarea(tarea.id)) ?? tarea) : tarea;
      return {
        task: completa,
        recipients: (completa.assignees ?? []).map((asignado) => asignado.userId),
        context: conContexto(completa, extra),
      };
    };

    switch (rule.trigger.type) {
      case AutomationTriggerType.TASK_DUE_SOON: {
        const margen = Number(rule.trigger.config.leadTimeMinutes);
        if (!Number.isFinite(margen)) return [];
        const limite = ahora.getTime() + margen * 60_000;
        const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
        const elegidas = abiertas.filter((tarea) => {
          if (!tarea.dueDate || (tarea.assignees ?? []).length === 0) return false;
          const vence = Date.parse(`${String(tarea.dueDate).slice(0, 10)}T23:59:59.999Z`);
          return vence >= hoy && vence <= limite;
        });
        return Promise.all(elegidas.map((tarea) => preparar(tarea, {})));
      }

      case AutomationTriggerType.TASK_OVERDUE: {
        const minimo = Number(rule.trigger.config.minDaysOverdue ?? 0);
        const elegidas = abiertas
          .map((tarea) => ({ tarea, dias: diasVencida(tarea, ahora) }))
          .filter(({ dias }) => dias !== null && dias >= minimo);
        return Promise.all(
          elegidas.map(({ tarea, dias }) => preparar(tarea, { overdueDays: dias })),
        );
      }

      case AutomationTriggerType.TASK_UNASSIGNED: {
        const minimo = Number(rule.trigger.config.minAgeDays ?? 0);
        const elegidas = abiertas
          .filter((tarea) => (tarea.assignees ?? []).length === 0)
          .map((tarea) => ({ tarea, dias: diasDesde(tarea.createdAt, ahora) ?? 0 }))
          .filter(({ dias }) => dias >= minimo);
        return Promise.all(elegidas.map(({ tarea, dias }) => preparar(tarea, { ageDays: dias })));
      }

      case AutomationTriggerType.TASK_STALE: {
        /* Este no se puede deducir del listado: «parada» se mide contra el
           historial de movimientos, que vive en tasks-service. */
        const dias = Number(rule.trigger.config.days ?? 7);
        const paradas = await firstValueFrom<
          Array<{ taskId: string; diasParada: number; vencida: boolean; sinHistorial?: boolean }>
        >(this.tasksClient.send({ cmd: 'task_stats_stale' }, { projectId: rule.projectId, dias }));
        const porId = new Map(abiertas.map((tarea) => [tarea.id, tarea]));
        const elegidas = (paradas ?? [])
          .map((parada) => ({ parada, tarea: porId.get(parada.taskId) }))
          .filter((par): par is { parada: (typeof paradas)[number]; tarea: TaskShape } =>
            Boolean(par.tarea),
          );
        return Promise.all(
          elegidas.map(({ parada, tarea }) =>
            preparar(tarea, {
              staleDays: parada.diasParada,
              overdue: parada.vencida,
              withoutHistory: parada.sinHistorial ?? false,
            }).then((candidata) => ({
              ...candidata,
              /* Sin encargados, avisa quien lleva el proyecto: es el
                 comportamiento que este disparador tuvo siempre. */
              recipients:
                candidata.recipients.length > 0 ? candidata.recipients : [project.ownerId],
            })),
          ),
        );
      }

      default:
        return [];
    }
  }
}

/** Días que lleva vencida una tarea, o `null` si no vence o aún no ha vencido. */
function diasVencida(tarea: TaskShape, ahora: Date): number | null {
  if (!tarea.dueDate) return null;
  const vence = Date.parse(`${String(tarea.dueDate).slice(0, 10)}T23:59:59.999Z`);
  if (Number.isNaN(vence) || vence >= ahora.getTime()) return null;
  return Math.floor((ahora.getTime() - vence) / 86_400_000);
}

/** Si esta regla necesita las etiquetas de la tarea para algo. */
function necesitaEtiquetas(rule: Rule): boolean {
  return (
    rule.conditions.some((condicion) => condicion.field === 'labelIds') ||
    rule.actions.some((accion) => accion.type === AutomationActionType.ADD_LABEL)
  );
}

/**
 * Lo que se guarda de la regla en cada ejecución.
 *
 * ⚠️ **Antes se guardaba la regla entera, y con ella sus condiciones, sus
 * acciones y su configuración completa — en cada fila.** Un proyecto con veinte
 * candidatas dejaba veinte copias del mismo objeto, y el listado de ejecuciones
 * las mandaba todas al navegador, que no usa ni una. Lo que hace falta para
 * auditar es saber **qué regla y en qué versión** actuó; lo demás está en la
 * regla, que es donde se puede leer entera.
 */
function resumenDeRegla(rule: Rule) {
  return {
    id: rule.id,
    name: rule.name,
    version: rule.version,
    trigger: rule.trigger.type,
    actions: rule.actions.map((accion) => accion.type),
  };
}
