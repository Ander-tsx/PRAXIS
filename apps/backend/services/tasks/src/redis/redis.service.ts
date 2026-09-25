import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/** Cuántos hechos se conservan en el stream de dominio. Ver `xadd`. */
const DOMAIN_STREAM_MAXLEN = 50_000;

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

  /**
   * Borra toda clave que empiece por `prefix`.
   *
   * `tasks:board:<id>` se cachea también con sufijos por `columnId`,
   * `sprintId` y `onlyBacklog` (`findAllTasks`), y un borrado por clave exacta
   * solo limpiaba la variante sin filtros: quien filtraba heredaba el listado
   * de quien no filtraba hasta que expirara el TTL. Es la misma trampa que ya
   * mordió con los agregados de Análisis (`CLAUDE.md`), aquí en tasks-service.
   *
   * `SCAN` y no `KEYS`: no bloquea Redis mientras recorre, a costa de no ser
   * atómico — aceptable para invalidar caché, que como mucho deja una lectura
   * de más sirviendo un dato viejo por un instante.
   */
  async delByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await this.client.del(...keys);
    } while (cursor !== '0');
  }

  /**
   * Añade un hecho al stream, **con tope**.
   *
   * 🔴 **Sin `MAXLEN` esto no se libera nunca.** Un `XACK` saca la entrada de
   * los pendientes del grupo, pero **no la borra del stream**: cada movimiento
   * de cada tarea de cada proyecto se quedaba ahí para siempre. Es una fuga
   * lenta y silenciosa, y cara — este Redis es también el de las sesiones, así
   * que llenarlo echa a todo el mundo.
   *
   * El `~` hace el recorte aproximado: Redis corta por nodos enteros cuando le
   * conviene, así que puede quedarse algo por encima. Es lo que se quiere — el
   * número exacto no importa, que no crezca sin fin sí.
   */
  async xadd(stream: string, fields: Record<string, string>): Promise<string | null> {
    return this.client.xadd(
      stream,
      'MAXLEN',
      '~',
      DOMAIN_STREAM_MAXLEN,
      '*',
      ...Object.entries(fields).flat(),
    );
  }
}
