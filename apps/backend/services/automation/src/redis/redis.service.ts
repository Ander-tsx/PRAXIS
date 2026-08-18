import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

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
}
