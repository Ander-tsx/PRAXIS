import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InitialDomainEvent, isInitialDomainEvent } from '@praxis/contracts';
import { AutomationEngineService } from '../executions/direct-execution';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService, StreamEntry } from '../redis/redis.service';

const DEFAULT_STREAM = 'praxis:domain-events';
const DEFAULT_GROUP = 'automation';

/**
 * Cuántas veces se intenta evaluar un hecho antes de darlo por perdido.
 *
 * Cinco: suficiente para aguantar un servicio reiniciándose, poco para que una
 * fila imposible —un proyecto que ya no existe— se reintente eternamente. Al
 * llegar aquí la fila queda en `FAILED` con `lastError`, que es lo que permite
 * mirar qué pasó en vez de adivinarlo.
 */
const EVENT_MAX_ATTEMPTS = 5;

export type InboundEventConsumerStats = {
  lag: number | null;
  pending: number;
  accepted: number;
  reclaimed: number;
  deduplicated: number;
  errors: number;
  /** Hechos cuyas reglas ya se han evaluado en esta pasada. */
  processed: number;
  /** Hechos que quedaron pendientes de evaluar y se reintentarán. */
  deferred: number;
  /** Hechos ya atendidos que se han retirado por antigüedad. */
  purged: number;
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
  /** Días que se conserva un hecho ya atendido. Ver `purgarAtendidos`. */
  private readonly retentionDays: number;
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
    processed: 0,
    deferred: 0,
    purged: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly engine: AutomationEngineService,
    config: ConfigService,
  ) {
    this.stream = config.get<string>('DOMAIN_EVENTS_STREAM', DEFAULT_STREAM);
    this.group = config.get<string>('DOMAIN_EVENTS_CONSUMER_GROUP', DEFAULT_GROUP);
    this.consumer =
      config.get<string>('DOMAIN_EVENTS_CONSUMER_NAME') ?? `automation-${randomUUID()}`;
    this.batchSize = config.get<number>('DOMAIN_EVENTS_BATCH_SIZE', 100);
    this.pollIntervalMs = config.get<number>('DOMAIN_EVENTS_POLL_INTERVAL_MS', 1000);
    this.claimIdleMs = config.get<number>('DOMAIN_EVENTS_CLAIM_IDLE_MS', 30000);
    this.retentionDays = config.get<number>('DOMAIN_EVENTS_RETENTION_DAYS', 7);
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
      processed: 0,
      deferred: 0,
      purged: 0,
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
      /* Y ahora lo que faltaba: evaluar las reglas contra lo que se acaba de
         guardar, y contra lo que quedó pendiente de pasadas anteriores. */
      await this.evaluarPendientes(stats);
      stats.purged = await this.purgarAtendidos();

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

  /**
   * Evalúa las reglas contra los hechos que aún no se han atendido.
   *
   * ## Por qué es un paso aparte y no va dentro de `processEntries`
   *
   * Guardar el hecho y actuar sobre él son dos cosas con dos formas de fallar
   * muy distintas. Guardar es rápido y local; actuar habla con dos servicios y
   * puede tardar. Si fueran lo mismo, un `tasks-service` lento bloquearía la
   * lectura del stream y el `XACK` no llegaría — Redis daría el mensaje por
   * huérfano y otro consumidor lo reclamaría **mientras el primero sigue
   * ejecutando acciones**. Separarlos hace que el stream se vacíe siempre y que
   * la tabla haga de cola.
   *
   * Por eso también se lee de la base y no de lo que acaba de llegar: así entra
   * lo que quedó a medias en una pasada anterior, sin ningún código de
   * reintento propio.
   *
   * ⚠️ **Un hecho que falla al evaluarse no se pierde ni se repite para
   * siempre.** Se queda en `ACCEPTED` con un intento más, y al llegar al techo
   * pasa a `FAILED` con el motivo escrito: sin ese techo, un proyecto borrado o
   * una regla imposible haría que la misma fila se intentara cada segundo hasta
   * el fin de los tiempos.
   */
  private async evaluarPendientes(stats: InboundEventConsumerStats): Promise<void> {
    const pendientes = await this.prisma.inboundEvent.findMany({
      where: { status: 'ACCEPTED', attempts: { lt: EVENT_MAX_ATTEMPTS } },
      orderBy: { receivedAt: 'asc' },
      take: this.batchSize,
    });

    for (const pendiente of pendientes) {
      try {
        await this.engine.handleTaskEvent({
          type: pendiente.type,
          projectId: pendiente.projectId,
          subjectId: pendiente.subjectId,
          payload: (pendiente.payload ?? {}) as Record<string, unknown>,
        });
        await this.prisma.inboundEvent.update({
          where: { id: pendiente.id },
          data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 } },
        });
        stats.processed += 1;
      } catch (error) {
        const intentos = pendiente.attempts + 1;
        const agotado = intentos >= EVENT_MAX_ATTEMPTS;
        await this.prisma.inboundEvent.update({
          where: { id: pendiente.id },
          data: {
            attempts: intentos,
            lastError: this.errorMessage(error).slice(0, 300),
            ...(agotado && { status: 'FAILED', processedAt: new Date() }),
          },
        });
        if (agotado) stats.errors += 1;
        else stats.deferred += 1;
        this.logger.warn(
          `inbound_event_evaluate_failed eventId=${pendiente.eventId} intento=${intentos} ` +
            `${this.errorMessage(error)}`,
        );
      }
    }
  }

  /**
   * Retira los hechos ya atendidos que llevan tiempo guardados.
   *
   * 🔴 **No se borraba ninguno.** `inbound_events` es un buzón de entrada, y un
   * buzón del que solo se encola acaba siendo la tabla más grande de la base sin
   * que nadie vuelva a leerla: la copia durable existe para sobrevivir a una
   * caída **entre** que el hecho llega y se atiende, no para siempre.
   *
   * ⚠️ **Los `FAILED` se conservan igual que los atendidos, y no más.** Es
   * tentador guardarlos para siempre «por si acaso», pero un hecho que agotó sus
   * cinco intentos hace una semana ya no se puede reproducir —el proyecto o la
   * tarea que lo motivó puede no existir— y lo que hacía falta saber está en el
   * registro.
   */
  private async purgarAtendidos(): Promise<number> {
    const limite = new Date(Date.now() - this.retentionDays * 86_400_000);
    const { count } = await this.prisma.inboundEvent.deleteMany({
      where: { status: { in: ['PROCESSED', 'FAILED'] }, receivedAt: { lt: limite } },
    });
    return count;
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
