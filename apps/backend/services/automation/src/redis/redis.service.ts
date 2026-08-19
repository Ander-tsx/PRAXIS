import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type StreamEntry = { id: string; fields: Record<string, string> };
export type ClaimedStreamEntries = { nextStartId: string; messages: StreamEntry[] };
export type ConsumerStreamMetrics = { lag: number | null; pending: number };

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  constructor(private readonly config: ConfigService) {}
  onModuleInit() {
    this.client = new Redis(this.config.getOrThrow<string>('REDIS_URL'));
    this.client.on('error', (error) => console.warn('Redis error:', error.message));
  }
  async onModuleDestroy() {
    await this.client?.quit();
  }
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
  async set(key: string, value: unknown, ttlSeconds = 30): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async createConsumerGroup(stream: string, group: string): Promise<void> {
    try {
      await this.client.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) throw error;
    }
  }

  async xreadgroup(
    stream: string,
    group: string,
    consumer: string,
    count: number,
  ): Promise<StreamEntry[]> {
    const response = await this.client.xreadgroup(
      'GROUP',
      group,
      consumer,
      'COUNT',
      count,
      'STREAMS',
      stream,
      '>',
    );
    return this.parseStreamResponse(response);
  }

  async xautoclaim(
    stream: string,
    group: string,
    consumer: string,
    minIdleTimeMs: number,
    startId: string,
    count: number,
  ): Promise<ClaimedStreamEntries> {
    const response = await this.client.xautoclaim(
      stream,
      group,
      consumer,
      minIdleTimeMs,
      startId,
      'COUNT',
      count,
    );
    return {
      nextStartId: String(response[0] ?? '0-0'),
      messages: this.parseEntries(response[1]),
    };
  }

  async xack(stream: string, group: string, id: string): Promise<number> {
    return this.client.xack(stream, group, id);
  }

  async getConsumerMetrics(stream: string, group: string): Promise<ConsumerStreamMetrics> {
    const pending = await this.client.xpending(stream, group);
    const groups = await this.client.xinfo('GROUPS', stream);
    const groupMetrics = (groups as unknown[][]).find(
      (entry) => this.toRecord(entry).name === group,
    );
    const lag = groupMetrics ? Number(this.toRecord(groupMetrics).lag) : null;
    return { lag: groupMetrics ? lag : null, pending: Number(pending[0] ?? 0) };
  }

  private parseStreamResponse(response: unknown): StreamEntry[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap((stream) =>
      Array.isArray(stream) ? this.parseEntries(stream[1]) : [],
    );
  }

  private parseEntries(value: unknown): StreamEntry[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') return [];
      return [{ id: entry[0], fields: this.toRecord(entry[1]) }];
    });
  }

  private toRecord(value: unknown): Record<string, string> {
    if (!Array.isArray(value)) return {};
    const record: Record<string, string> = {};
    for (let index = 0; index < value.length; index += 2) {
      if (typeof value[index] === 'string') record[value[index]] = String(value[index + 1]);
    }
    return record;
  }
}
