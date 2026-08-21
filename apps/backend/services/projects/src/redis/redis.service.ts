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

  /**
   * Publica en un canal de Redis.
   *
   * Es lo que lleva un aviso recién creado hasta el gateway, que es quien tiene
   * abiertas las conexiones con los navegadores. Este servicio no las conoce ni
   * debe: habla por TCP con el gateway y no al revés.
   *
   * ⚠️ **No espera a nadie y no debe fallar hacia arriba.** Publicar en un canal
   * sin suscriptores no es un error —significa que ese usuario no tiene ninguna
   * pestaña abierta—, y que Redis esté caído tampoco puede tumbar la creación
   * del aviso: el aviso ya está guardado y se verá al recargar. El tiempo real
   * es una mejora sobre la bandeja, no su sustituto.
   */
  async publish(channel: string, payload: unknown): Promise<void> {
    try {
      await this.client.publish(channel, JSON.stringify(payload));
    } catch (error) {
      console.warn('Redis publish falló:', (error as Error).message);
    }
  }
}
