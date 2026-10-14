import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** Lo que se le enseña a la persona. El service worker lo pinta tal cual. */
export interface CargaPush {
  title: string;
  body: string;
  /** A dónde lleva pulsar la notificación. Ruta relativa de la aplicación. */
  url: string;
  /** Mismo `tag` = la notificación nueva sustituye a la anterior (un chat = una). */
  tag?: string;
}

/** Misma clave que escribe `PresenceService` del gateway al abrirse un SSE. */
const CLAVE_CONECTADO = 'presencia:conectado:';

/** Cuánto aguarda el servicio de push un mensaje que no puede entregar. */
const TTL_S = 60 * 60 * 12;

/**
 * Notificaciones push (Web Push) — `docs/PLAN-PUSH.md`.
 *
 * Vive en projects-service porque ya es dueño de los avisos y del chat, y así no
 * hay servicio nuevo que registrar en el monolito. Sin claves VAPID en el
 * entorno **se apaga entero**: `habilitado` es falso, nada falla y los
 * endpoints responden que no está disponible.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  readonly publicKey: string | null;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    const publica = config.get<string>('PUSH_VAPID_PUBLIC_KEY');
    const privada = config.get<string>('PUSH_VAPID_PRIVATE_KEY');
    const asunto = config.get<string>('PUSH_VAPID_SUBJECT') || 'mailto:soporte@usepraxis.space';
    if (publica && privada) {
      webpush.setVapidDetails(asunto, publica, privada);
      this.publicKey = publica;
    } else {
      this.publicKey = null;
      this.log.warn('Sin claves VAPID: las notificaciones push están apagadas.');
    }
  }

  get habilitado(): boolean {
    return this.publicKey !== null;
  }

  claveSecreta() {
    return { publicKey: this.publicKey };
  }

  /**
   * Registra o traspasa un dispositivo.
   *
   * `upsert` por `endpoint`: si el dispositivo ya estaba a nombre de otra
   * persona, pasa a la actual. Un teléfono compartido no puede seguir recibiendo
   * los avisos de quien cerró sesión.
   */
  async suscribir(dto: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
  }) {
    if (!this.habilitado) {
      throw new RpcException({
        statusCode: 503,
        message: 'Las notificaciones push no están activas',
      });
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId: dto.userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent?.slice(0, 300) ?? null,
      },
      update: { userId: dto.userId, p256dh: dto.p256dh, auth: dto.auth },
    });
    return { ok: true };
  }

  /** `userId` en el `where`: nadie da de baja el dispositivo de otra persona. */
  async desuscribir(dto: { userId: string; endpoint: string }) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId: dto.userId, endpoint: dto.endpoint },
    });
    return { ok: true };
  }

  /** ¿Este dispositivo está suscrito a nombre de esta persona? Para pintar el interruptor. */
  async estado(dto: { userId: string; endpoint?: string | null }) {
    const [dispositivos, esteDispositivo] = await Promise.all([
      this.prisma.pushSubscription.count({ where: { userId: dto.userId } }),
      dto.endpoint
        ? this.prisma.pushSubscription.count({
            where: { userId: dto.userId, endpoint: dto.endpoint },
          })
        : Promise.resolve(0),
    ]);
    return { habilitado: this.habilitado, dispositivos, esteDispositivo: esteDispositivo > 0 };
  }

  /**
   * Manda una notificación a todos los dispositivos de estas personas.
   *
   * Nunca lanza: un push es un extra sobre algo que ya está guardado. Borra las
   * suscripciones que el servicio de push da por muertas (404/410).
   */
  async enviar(userIds: string[], carga: CargaPush): Promise<{ enviados: number }> {
    if (!this.habilitado || userIds.length === 0) return { enviados: 0 };
    try {
      const subs = await this.prisma.pushSubscription.findMany({
        where: { userId: { in: userIds } },
      });
      const cuerpo = JSON.stringify(carga);
      let enviados = 0;
      const muertas: string[] = [];
      await Promise.all(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              cuerpo,
              { TTL: TTL_S, urgency: 'normal' },
            );
            enviados++;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) muertas.push(sub.id);
            else
              this.log.warn(
                `Push fallido (${status ?? 'sin código'}): ${(error as Error).message}`,
              );
          }
        }),
      );
      if (muertas.length > 0) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: { in: muertas } } });
      }
      return { enviados };
    } catch (error) {
      this.log.warn(`No se pudo enviar el push: ${(error as Error).message}`);
      return { enviados: 0 };
    }
  }

  /**
   * Un mensaje de chat, solo a quien **no tiene la aplicación abierta**.
   *
   * Si hay un SSE abierto (clave de presencia en Redis), la persona ya lo ve en
   * pantalla: mandarle además un push es ruido y gasto. Sin Redis, se asume
   * desconectada, que es el valor seguro (mejor un aviso de más que ninguno).
   */
  async avisarMensaje(destinatarios: string[], carga: CargaPush): Promise<void> {
    if (!this.habilitado || destinatarios.length === 0) return;
    const desconectados: string[] = [];
    for (const id of destinatarios) {
      const conectado = await this.redis.get(`${CLAVE_CONECTADO}${id}`).catch(() => null);
      if (!conectado) desconectados.push(id);
    }
    await this.enviar(desconectados, carga);
  }
}
