import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * La caché de este servicio. Gemela de la de permissions-service, a propósito.
 *
 * ⚠️ **Redis no rompe la invariante de que `billing-service` no habla con
 * nadie.** Esa regla es sobre **otros microservicios**: si aparece un
 * `*_SERVICE_HOST` en su `.env`, se ha invertido el reparto de quién pregunta a
 * quién. Redis es infraestructura —igual que Postgres— y es exactamente lo que
 * ya usa permissions-service para lo mismo.
 *
 * ⚠️ **Y falla hacia la base, nunca hacia arriba.** Si Redis no responde, cada
 * lectura vuelve a Postgres y todo sigue funcionando más despacio. Una caché que
 * puede tumbar el servicio es peor que no tener caché.
 */
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
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 30): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* Sin caché se sigue: la próxima lectura irá a la base. */
    }
  }

  /**
   * Borra todo lo cacheado de una organización.
   *
   * 🔴 **Se llama en cada escritura que cambia quién puede qué.** Un papel
   * editado que tarda treinta segundos en aplicarse es un permiso que sigue
   * abierto treinta segundos después de habérselo quitado a alguien, y eso no es
   * «un poco de retraso»: es un agujero con reloj.
   */
  async olvidarOrganizacion(organizationId: string): Promise<void> {
    try {
      const claves = await this.client.keys(`billing:org:${organizationId}:*`);
      if (claves.length > 0) await this.client.del(...claves);
    } catch {
      /* Si no se pudo invalidar, lo que queda vive como mucho un TTL. */
    }
  }

  /** Lo que se cachea de una persona: la lista de sus organizaciones. */
  async olvidarUsuario(userId: string): Promise<void> {
    try {
      await this.client.del(`billing:user:${userId}:orgs`);
    } catch {
      /* Igual que arriba. */
    }
  }
}
