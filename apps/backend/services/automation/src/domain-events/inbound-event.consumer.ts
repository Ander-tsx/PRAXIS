import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InitialDomainEvent, isInitialDomainEvent } from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService, StreamEntry } from '../redis/redis.service';

const DEFAULT_STREAM = 'praxis:domain-events';
const DEFAULT_GROUP = 'automation';

export type InboundEventConsumerStats = {
  lag: number | null;
  pending: number;
  accepted: number;
  reclaimed: number;
  deduplicated: number;
  errors: number;
};

@Injectable()
export class InboundEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboundEventConsumer.name);
  private readonly stream: string;
  private readonly group: string;
  private readonly consumer: string;
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly claimIdleMs: number;
  private timer?: NodeJS.Timeout;
  private consuming = false;
  private claimStartId = '0-0';
  private lastMetrics: InboundEventConsumerStats = {
    lag: null,
    pending: 0,
    accepted: 0,
    reclaimed: 0,
    deduplicated: 0,
    errors: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.stream = config.get<string>('DOMAIN_EVENTS_STREAM', DEFAULT_STREAM);
    this.group = config.get<string>('DOMAIN_EVENTS_CONSUMER_GROUP', DEFAULT_GROUP);
    this.consumer =
      config.get<string>('DOMAIN_EVENTS_CONSUMER_NAME') ?? `automation-${randomUUID()}`;
    this.batchSize = config.get<number>('DOMAIN_EVENTS_BATCH_SIZE', 100);
    this.pollIntervalMs = config.get<number>('DOMAIN_EVENTS_POLL_INTERVAL_MS', 1000);
    this.claimIdleMs = config.get<number>('DOMAIN_EVENTS_CLAIM_IDLE_MS', 30000);
  }

  onModuleInit() {
    void this.consumeOnce();
    this.timer = setInterval(() => void this.consumeOnce(), this.pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getMetrics(): InboundEventConsumerStats {
    return { ...this.lastMetrics };
  }

  async consumeOnce(): Promise<InboundEventConsumerStats> {
    if (this.consuming) return { ...this.lastMetrics };

    this.consuming = true;
    const stats: InboundEventConsumerStats = {
      lag: null,
      pending: 0,
      accepted: 0,
      reclaimed: 0,
      deduplicated: 0,
      errors: 0,
    };

    try {
      await this.redis.createConsumerGroup(this.stream, this.group);
      const claimed = await this.redis.xautoclaim(
        this.stream,
        this.group,
        this.consumer,
        this.claimIdleMs,
        this.claimStartId,
        this.batchSize,
      );
      this.claimStartId = claimed.nextStartId;
      stats.reclaimed = claimed.messages.length;
      await this.processEntries(claimed.messages, stats);
      await this.processEntries(
        await this.redis.xreadgroup(this.stream, this.group, this.consumer, this.batchSize),
        stats,
      );
      const streamMetrics = await this.redis.getConsumerMetrics(this.stream, this.group);
      stats.lag = streamMetrics.lag;
      stats.pending = streamMetrics.pending;
    } catch (error) {
      stats.errors += 1;
      this.logger.warn(`inbound_event_poll_failed ${this.errorMessage(error)}`);
    } finally {
      this.consuming = false;
      this.lastMetrics = { ...stats };
      this.logger.log(`inbound_event_metrics ${JSON.stringify(stats)}`);
    }

    return stats;
  }

  private async processEntries(
    entries: StreamEntry[],
    stats: InboundEventConsumerStats,
  ): Promise<void> {
    for (const entry of entries) {
      try {
        const event = this.parseEvent(entry);
        await this.prisma.inboundEvent.create({
          data: {
            eventId: event.id,
            dedupeKey: this.dedupeKey(event),
            streamId: entry.id,
            type: event.type,
            source: event.source,
            occurredAt: new Date(event.occurredAt),
            projectId: event.projectId,
            subjectType: event.subject.type,
            subjectId: event.subject.id,
            actorType: event.actor.type,
            actorId: event.actor.id,
            correlationId: event.correlationId,
            causationId: event.causationId,
            payload: event.payload,
          },
        });
        await this.redis.xack(this.stream, this.group, entry.id);
        stats.accepted += 1;
      } catch (error) {
        if (this.isUniqueConstraint(error)) {
          try {
            await this.redis.xack(this.stream, this.group, entry.id);
            stats.deduplicated += 1;
          } catch (ackError) {
            stats.errors += 1;
            this.logger.warn(`inbound_event_ack_failed ${this.errorMessage(ackError)}`);
          }
          continue;
        }
        stats.errors += 1;
        this.logger.warn(
          `inbound_event_persist_failed streamId=${entry.id} ${this.errorMessage(error)}`,
        );
      }
    }
  }

  private parseEvent(entry: StreamEntry): InitialDomainEvent {
    const raw = entry.fields.event;
    if (!raw) throw new Error('missing_domain_event');
    const event: unknown = JSON.parse(raw);
    if (!isInitialDomainEvent(event)) throw new Error('invalid_domain_event');
    return event;
  }

  private dedupeKey(event: InitialDomainEvent): string {
    return createHash('sha256')
      .update(
        JSON.stringify(
          this.canonicalize({
            type: event.type,
            source: event.source,
            occurredAt: event.occurredAt,
            projectId: event.projectId,
            subject: event.subject,
            actor: event.actor,
            correlationId: event.correlationId,
            causationId: event.causationId,
            payload: event.payload,
          }),
        ),
      )
      .digest('hex');
  }

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.canonicalize(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, item]) => [key, this.canonicalize(item)]),
    );
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown_error';
  }
}
