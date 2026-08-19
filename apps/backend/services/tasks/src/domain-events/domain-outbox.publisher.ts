import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const DEFAULT_STREAM = 'praxis:domain-events';

type PendingOutboxRow = {
  id: string;
  eventId: string;
  type: string;
  source: string;
  occurredAt: Date;
  projectId: string;
  subjectType: string;
  subjectId: string;
  actorType: string;
  actorId: string | null;
  correlationId: string;
  causationId: string | null;
  payload: unknown;
  createdAt: Date;
};

export type DomainOutboxPublishStats = {
  pending: number;
  oldestPendingAgeMs: number | null;
  published: number;
  errors: number;
};

@Injectable()
export class TaskDomainOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskDomainOutboxPublisher.name);
  private readonly stream: string;
  private readonly batchSize: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly pollIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private publishing = false;
  private lastMetrics: DomainOutboxPublishStats = {
    pending: 0,
    oldestPendingAgeMs: null,
    published: 0,
    errors: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.stream = config.get<string>('DOMAIN_OUTBOX_STREAM', DEFAULT_STREAM);
    this.batchSize = config.get<number>('DOMAIN_OUTBOX_BATCH_SIZE', 100);
    this.retryAttempts = config.get<number>('DOMAIN_OUTBOX_RETRY_ATTEMPTS', 3);
    this.retryDelayMs = config.get<number>('DOMAIN_OUTBOX_RETRY_DELAY_MS', 50);
    this.pollIntervalMs = config.get<number>('DOMAIN_OUTBOX_POLL_INTERVAL_MS', 5000);
  }

  onModuleInit() {
    void this.publishPending();
    this.timer = setInterval(() => void this.publishPending(), this.pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getMetrics(): DomainOutboxPublishStats {
    return { ...this.lastMetrics };
  }

  async publishPending(): Promise<DomainOutboxPublishStats> {
    if (this.publishing) return { pending: 0, oldestPendingAgeMs: null, published: 0, errors: 0 };

    this.publishing = true;
    const stats: DomainOutboxPublishStats = {
      pending: 0,
      oldestPendingAgeMs: null,
      published: 0,
      errors: 0,
    };

    try {
      const where = { publishedAt: null };
      const [rows, pending, oldestPending] = await Promise.all([
        this.prisma.domainOutbox.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: this.batchSize,
        }),
        this.prisma.domainOutbox.count({ where }),
        this.prisma.domainOutbox.findFirst({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { createdAt: true },
        }),
      ]);
      stats.pending = pending;
      stats.oldestPendingAgeMs = oldestPending
        ? Date.now() - oldestPending.createdAt.getTime()
        : null;

      for (const row of rows as PendingOutboxRow[]) {
        if (await this.publishRow(row)) stats.published += 1;
        else stats.errors += 1;
      }
    } catch (error) {
      stats.errors += 1;
      this.logger.warn(`domain_outbox_poll_failed ${this.errorMessage(error)}`);
    } finally {
      this.publishing = false;
      this.lastMetrics = { ...stats };
      this.logger.log(`domain_outbox_metrics ${JSON.stringify(stats)}`);
    }

    return stats;
  }

  private async publishRow(row: PendingOutboxRow): Promise<boolean> {
    const event = {
      id: row.eventId,
      type: row.type,
      source: row.source,
      occurredAt: row.occurredAt.toISOString(),
      projectId: row.projectId,
      subject: { type: row.subjectType, id: row.subjectId },
      actor: row.actorId ? { type: row.actorType, id: row.actorId } : { type: row.actorType },
      correlationId: row.correlationId,
      ...(row.causationId ? { causationId: row.causationId } : {}),
      payload: row.payload,
    };

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        await this.redis.xadd(this.stream, { event: JSON.stringify(event) });
        break;
      } catch (error) {
        if (!this.isTemporaryRedisError(error) || attempt === this.retryAttempts) {
          this.logger.warn(
            `domain_outbox_xadd_failed eventId=${row.eventId} ${this.errorMessage(error)}`,
          );
          return false;
        }
        await this.delay(this.retryDelayMs);
      }
    }

    try {
      const marked = await this.prisma.domainOutbox.updateMany({
        where: { id: row.id, publishedAt: null },
        data: { publishedAt: new Date() },
      });
      return marked.count === 1;
    } catch (error) {
      this.logger.warn(
        `domain_outbox_mark_failed eventId=${row.eventId} ${this.errorMessage(error)}`,
      );
      return false;
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown_error';
  }

  private isTemporaryRedisError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return [
      'econnrefused',
      'econnreset',
      'etimedout',
      'connection is closed',
      'connection closed',
      'socket',
      'try again',
      'loading',
    ].some((marker) => message.includes(marker));
  }
}
