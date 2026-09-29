import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { alReanudar, enReposo } from '@praxis/local-transport';

/**
 * El publicador del buzón de salida, una sola vez.
 *
 * ## Por qué esto vive en `commons`
 *
 * Estaba **duplicado byte a byte** entre `tasks-service` y `projects-service`:
 * ciento ochenta y seis líneas que solo se diferenciaban en el nombre de la
 * clase, más doscientas cincuenta de pruebas repetidas al lado. Eso no es un
 * problema estético — es que el patrón que sostiene la entrega de hechos
 * (publicar, y solo después marcar como publicado) tenía dos implementaciones
 * que podían separarse en el primer arreglo que alguien hiciera en una sola.
 *
 * ## El orden de los dos pasos es el diseño entero
 *
 * Se escribe en el stream **y después** se marca la fila como publicada. Si el
 * proceso se cae en medio, la fila sigue pendiente y el siguiente ciclo la
 * vuelve a publicar: **entrega al menos una vez**. El duplicado lo absorbe el
 * consumidor, que deduplica por un hash canónico del hecho.
 *
 * Al revés —marcar primero— sería entrega *como mucho* una vez, y una caída en
 * el hueco perdería el hecho para siempre sin que nada lo dijera.
 *
 * ⚠️ **Por eso `publishRow` devuelve `false` si falla el marcado.** No es un
 * detalle: sin ese `false`, un fallo al escribir en la base contaría como
 * publicado en las métricas y nadie vería que la fila se va a republicar.
 */

/** El mínimo que este publicador necesita de Redis. */
export interface OutboxStream {
  xadd(stream: string, fields: Record<string, string>): Promise<string | null>;
}

/** Una fila del buzón, tal y como la guardan los servicios. */
export interface PendingOutboxRow {
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
}

/** El mínimo que este publicador necesita de Prisma. */
export interface OutboxStore {
  domainOutbox: {
    findMany(args: unknown): Promise<PendingOutboxRow[]>;
    count(args: unknown): Promise<number>;
    findFirst(args: unknown): Promise<{ createdAt: Date } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
}

export interface DomainOutboxPublishStats {
  pending: number;
  oldestPendingAgeMs: number | null;
  published: number;
  errors: number;
  /** Filas ya publicadas que se han retirado por antigüedad. */
  purged: number;
}

const DEFAULT_STREAM = 'praxis:domain-events';

/**
 * Cuántos hechos se conservan en el stream de Redis.
 *
 * 🔴 **Un `XACK` no borra nada del stream**, solo saca la entrada de la lista de
 * pendientes del grupo. Sin un tope, `praxis:domain-events` crece con cada
 * movimiento de cada tarea de cada proyecto y **nunca** se libera: es una fuga
 * de memoria lenta que no da un solo error hasta que Redis se queda sin sitio y
 * empieza a expulsar claves — entre ellas las sesiones, que viven en el mismo
 * Redis.
 *
 * Con `~` el recorte es aproximado y casi gratis: Redis corta por nodos enteros
 * cuando le viene bien, así que puede quedarse algo por encima del número. Es lo
 * que se quiere — el número exacto no importa, que no crezca sin fin sí.
 */
const STREAM_MAXLEN = 50_000;

/** Días que se conserva una fila ya publicada del buzón. */
const RETENTION_DAYS = 7;

export abstract class DomainOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  protected readonly logger: Logger;
  private readonly stream: string;
  private readonly batchSize: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly retentionDays: number;
  private timer?: NodeJS.Timeout;
  private dejarDeEsperar?: () => void;
  private publishing = false;
  private lastMetrics: DomainOutboxPublishStats = {
    pending: 0,
    oldestPendingAgeMs: null,
    published: 0,
    errors: 0,
    purged: 0,
  };

  protected constructor(
    private readonly prisma: OutboxStore,
    private readonly redis: OutboxStream,
    config: ConfigService,
    nombre: string,
  ) {
    this.logger = new Logger(nombre);
    this.stream = config.get<string>('DOMAIN_OUTBOX_STREAM', DEFAULT_STREAM);
    this.batchSize = config.get<number>('DOMAIN_OUTBOX_BATCH_SIZE', 100);
    this.retryAttempts = config.get<number>('DOMAIN_OUTBOX_RETRY_ATTEMPTS', 3);
    this.retryDelayMs = config.get<number>('DOMAIN_OUTBOX_RETRY_DELAY_MS', 50);
    this.pollIntervalMs = config.get<number>('DOMAIN_OUTBOX_POLL_INTERVAL_MS', 5000);
    this.retentionDays = config.get<number>('DOMAIN_OUTBOX_RETENTION_DAYS', RETENTION_DAYS);
  }

  onModuleInit() {
    void this.publishPending();
    /* En reposo no se consulta nada: cada consulta es tráfico saliente, y con
       tráfico Railway no duerme el contenedor (docs/PLAN-MONOLITO.md, M-K). Lo
       que se escribió antes del reposo ya salió: el plazo es de minutos y esto
       pasa cada pocos segundos. */
    this.timer = setInterval(() => {
      if (!enReposo()) void this.publishPending();
    }, this.pollIntervalMs);
    this.dejarDeEsperar = alReanudar(() => void this.publishPending());
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.dejarDeEsperar?.();
  }

  getMetrics(): DomainOutboxPublishStats {
    return { ...this.lastMetrics };
  }

  async publishPending(): Promise<DomainOutboxPublishStats> {
    if (this.publishing) {
      return { pending: 0, oldestPendingAgeMs: null, published: 0, errors: 0, purged: 0 };
    }

    this.publishing = true;
    const stats: DomainOutboxPublishStats = {
      pending: 0,
      oldestPendingAgeMs: null,
      published: 0,
      errors: 0,
      purged: 0,
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

      for (const row of rows) {
        if (await this.publishRow(row)) stats.published += 1;
        else stats.errors += 1;
      }

      stats.purged = await this.purgarPublicados();
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

  /**
   * Retira las filas ya publicadas que llevan tiempo ahí.
   *
   * 🔴 **No se borraba ninguna.** `publishedAt` se ponía y la fila se quedaba
   * para siempre: la tabla crecía con cada cambio de cada tarea y nadie la
   * consultaba nunca más — el consumidor lee del stream, no de aquí. El buzón es
   * una cola, y una cola de la que solo se encola acaba siendo el objeto más
   * grande de la base sin haber servido para nada después del primer segundo.
   *
   * Una semana es margen de sobra: lo que no se ha publicado en siete días no
   * se va a publicar, y lo que sí se publicó ya lo absorbió el consumidor.
   */
  private async purgarPublicados(): Promise<number> {
    const limite = new Date(Date.now() - this.retentionDays * 86_400_000);
    const { count } = await this.prisma.domainOutbox.deleteMany({
      where: { publishedAt: { not: null, lt: limite } },
    });
    return count;
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

export { STREAM_MAXLEN };
