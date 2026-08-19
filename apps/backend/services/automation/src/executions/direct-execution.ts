import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { matchesAllConditions } from './rule-matcher';

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

type Rule = {
  id: string;
  projectId: string;
  name: string;
  version: number;
  trigger: { type: string; config: Record<string, unknown> };
  conditions: Array<{ field: string; operator: string; value: unknown; position: number }>;
  actions: Array<{ type: string; config: Record<string, unknown>; position: number }>;
};

type Candidate = {
  taskId: string;
  taskTitle: string;
  recipients: string[];
  context: Record<string, unknown>;
};

export function executionCauseKey(
  rule: Pick<Rule, 'id' | 'version'>,
  candidate: Pick<Candidate, 'taskId' | 'context'>,
) {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(candidate.context))
    .digest('hex')
    .slice(0, 20);
  return `manual:${rule.version}:${candidate.taskId}:${fingerprint}`;
}

const waitBeforeRetry = () => new Promise<void>((resolve) => setTimeout(resolve, 250));

@Injectable()
export class AutomationEngineService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  async reviewProject(projectId: string) {
    const [project, rules] = await Promise.all([
      firstValueFrom(this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId })),
      this.prisma.automationRule.findMany({
        where: { projectId, status: 'ENABLED' },
        include: {
          trigger: true,
          conditions: { orderBy: { position: 'asc' } },
          actions: { orderBy: { position: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!project) throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    if (project.status && project.status !== 'ACTIVE') {
      throw new RpcException({ statusCode: 403, message: 'El proyecto no está activo' });
    }

    let candidates = 0;
    let succeeded = 0;
    let failed = 0;

    for (const rule of rules as Rule[]) {
      const found = await this.candidatesFor(rule, project.ownerId);
      candidates += found.length;
      for (const candidate of found) {
        const matched = matchesAllConditions(rule.conditions, candidate.context);
        const causeKey = executionCauseKey(rule, candidate);
        const previous = await this.prisma.ruleExecution.findUnique({
          where: { ruleId_causeKey: { ruleId: rule.id, causeKey } },
          select: { id: true },
        });
        if (previous) continue;
        const execution = await this.prisma.ruleExecution.create({
          data: {
            ruleId: rule.id,
            ruleVersion: rule.version,
            causeKey,
            ruleSnapshot: rule as never,
            conditionResult: { matched, context: candidate.context } as never,
            status: matched ? 'RUNNING' : 'SKIPPED',
            startedAt: new Date(),
            ...(!matched && { finishedAt: new Date() }),
          },
        });
        if (!matched) continue;

        const operations = rule.actions.map(
          (action) => () => this.executeAction(action, candidate, project),
        );
        const results = await executeSequentially(operations, waitBeforeRetry);
        const status = results.some((result) => result.status === 'FAILED')
          ? 'FAILED'
          : 'SUCCEEDED';
        await this.prisma.ruleExecution.update({
          where: { id: execution.id },
          data: {
            status,
            actionResults: results as never,
            finishedAt: new Date(),
          },
        });
        if (status === 'SUCCEEDED') succeeded += 1;
        else failed += 1;
      }
    }

    return { rules: rules.length, candidates, succeeded, failed };
  }

  async recent(projectId: string, limit = 20) {
    return this.prisma.ruleExecution.findMany({
      where: { rule: { projectId } },
      include: { rule: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
  }

  private async candidatesFor(rule: Rule, ownerId: string): Promise<Candidate[]> {
    const handlers: Record<string, () => Promise<Candidate[]>> = {
      TASK_DUE_SOON: () => this.dueSoonCandidates(rule),
      TASK_STALE: () => this.staleCandidates(rule, ownerId),
    };
    return handlers[rule.trigger.type]?.() ?? [];
  }

  private async dueSoonCandidates(rule: Rule): Promise<Candidate[]> {
    const tasks = await firstValueFrom<
      Array<{
        id: string;
        titulo: string;
        prioridad: string;
        vence: string | null;
        cerrada: boolean;
        encargados: string[];
      }>
    >(this.tasksClient.send({ cmd: 'task_inventory' }, { projectId: rule.projectId }));
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const latest = now.getTime() + Number(rule.trigger.config.leadTimeMinutes) * 60_000;
    return tasks
      .filter((task) => {
        if (task.cerrada || !task.vence || task.encargados.length === 0) return false;
        const due = Date.parse(`${task.vence}T23:59:59.999Z`);
        return due >= today && due <= latest;
      })
      .map((task) => ({
        taskId: task.id,
        taskTitle: task.titulo,
        recipients: task.encargados,
        context: {
          priority: task.prioridad,
          dueDate: task.vence,
          assigneeCount: task.encargados.length,
        },
      }));
  }

  private async staleCandidates(rule: Rule, ownerId: string): Promise<Candidate[]> {
    const days = Number(rule.trigger.config.days ?? 7);
    const tasks = await firstValueFrom<
      Array<{
        taskId: string;
        titulo: string;
        diasParada: number;
        vencida: boolean;
        sinHistorial?: boolean;
      }>
    >(
      this.tasksClient.send({ cmd: 'task_stats_stale' }, { projectId: rule.projectId, dias: days }),
    );
    return tasks.map((task) => ({
      taskId: task.taskId,
      taskTitle: task.titulo,
      recipients: [ownerId],
      context: {
        staleDays: task.diasParada,
        overdue: task.vencida,
        withoutHistory: task.sinHistorial ?? false,
      },
    }));
  }

  private async executeAction(
    action: Rule['actions'][number],
    candidate: Candidate,
    project: { id: string; name?: string; ownerId: string },
  ) {
    const handlers: Record<string, () => Promise<unknown>> = {
      CREATE_NOTIFICATION: () => this.createNotification(action, candidate, project),
    };
    const handler = handlers[action.type];
    if (!handler) throw new Error(`Acción no registrada: ${action.type}`);
    return handler();
  }

  private createNotification(
    action: Rule['actions'][number],
    candidate: Candidate,
    project: { id: string; name?: string; ownerId: string },
  ) {
    const selector = action.config.recipientSelector;
    const recipients = selector === 'PROJECT_OWNER' ? [project.ownerId] : candidate.recipients;
    const type =
      selector === 'PROJECT_OWNER' ? 'AUTOMATION_TASK_STALE' : 'AUTOMATION_TASK_DUE_SOON';
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'notification_create' },
        {
          notifications: recipients.map((userId) => ({
            userId,
            type,
            projectId: project.id,
            projectName: project.name,
            taskId: candidate.taskId,
            taskTitle: candidate.taskTitle,
          })),
        },
      ),
    );
  }
}
