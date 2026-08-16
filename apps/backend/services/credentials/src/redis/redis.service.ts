import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.client.on('error', (err) => console.warn('Redis error:', err.message));
  }

  onModuleDestroy() {
    this.client?.quit();
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

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  /**
   * Operaciones de hash, para las sesiones.
   *
   * Una sesión ya no es una clave por usuario: es **un campo por dispositivo**
   * dentro de una clave por usuario (ver `AuthService`). Un hash da las dos
   * cosas que hacen falta a la vez — leer o quitar una sola sesión, y cerrarlas
   * todas con un `DEL` — sin mantener un índice aparte que se pueda
   * desincronizar.
   */
  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  /** Devuelve cuántos campos quedan **después** de borrar. */
  async hdel(key: string, field: string): Promise<number> {
    await this.client.hdel(key, field);
    return this.client.hlen(key);
  }

  /**
   * Renueva el plazo de una clave sin tocar su contenido.
   *
   * Es lo que convierte el plazo de la sesión en deslizante: mientras se use, no
   * se va sola.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }
}
