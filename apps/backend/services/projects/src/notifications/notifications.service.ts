import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  CreateNotificationDto,
  CreateNotificationsDto,
  FindNotificationsDto,
  MarkAllNotificationsReadDto,
  MarkNotificationReadDto,
} from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcher } from '../realtime/event-dispatcher.service';

/** Tope de la bandeja. Por encima de esto nadie baja a mirar. */
const DEFAULT_LIMIT = 30;

/*
 * ⚠️ `canalDeAvisos` vivía aquí y se ha movido a `realtime/events.ts` como
 * `liveEventChannel`. Por ese canal ya no viajan solo avisos de bandeja: viajan
 * también los mensajes, ediciones, borrados y marcas de lectura del chat, así
 * que tenerlo colgando del módulo de notificaciones obligaba al chat a importar
 * de notificaciones para hablar de algo que no son notificaciones.
 */

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventDispatcher,
  ) {}

  /**
   * Crea avisos en bloque.
   *
   * **Nunca avisa a quien provocó el hecho.** Recibir «te has asignado una
   * tarea» es ruido puro, y el filtro va aquí y no en cada emisor: son seis
   * sitios distintos y bastaría con olvidarlo en uno para que la bandeja
   * empezara a contarte tu propio trabajo.
   *
   * `createMany` de una sola vez: asignar una tarea a cuatro personas es un
   * evento y cuatro filas.
   */
  async createNotifications(dto: CreateNotificationsDto) {
    const worth = (dto.notifications ?? []).filter(
      (notification) => notification.userId !== notification.actorId,
    );
    if (worth.length === 0) return { created: 0 };

    const { count } = await this.prisma.notification.createMany({
      data: worth.map((notification) => ({
        userId: notification.userId,
        type: notification.type,
        actorId: notification.actorId ?? null,
        projectId: notification.projectId ?? null,
        projectName: notification.projectName ?? null,
        organizationId: notification.organizationId ?? null,
        organizationName: notification.organizationName ?? null,
        taskId: notification.taskId ?? null,
        taskTitle: notification.taskTitle ?? null,
      })),
    });

    /**
     * Aviso en vivo, **después** de guardar y sin esperar a que llegue.
     *
     * ⚠️ Va con `void` a propósito: publicar no puede retrasar ni romper la
     * respuesta. Quien crea la notificación está a mitad de otra operación
     * —asignar una tarea, invitar a alguien— y el tiempo real es un extra
     * sobre algo que ya está persistido.
     *
     * Se publica lo que se acaba de escribir y no las filas creadas porque
     * `createMany` no las devuelve. Es suficiente: lleva lo justo para pintar
     * el aviso emergente, y la bandeja auténtica se pide aparte.
     */
    const at = new Date().toISOString();
    for (const notification of worth) {
      /* El sobre lleva `tipo: 'aviso'` en la raíz, que es lo que el cliente
         mira para despachar. El `type` de dentro sigue siendo el enum de la
         tabla `notifications` — son dos cosas distintas y por eso no comparten
         nombre. Ver `realtime/events.ts`. */
      void this.eventos.aUnaPersona(notification.userId, {
        tipo: 'aviso',
        type: notification.type,
        actorId: notification.actorId ?? null,
        projectId: notification.projectId ?? null,
        projectName: notification.projectName ?? null,
        organizationId: notification.organizationId ?? null,
        organizationName: notification.organizationName ?? null,
        /* El slug no lo trae el DTO de la notificación —la tabla guarda el
           nombre del proyecto como copia del momento, no su slug— así que va
           nulo y el cliente cae al `projectId`, que el guard también resuelve. */
        projectSlug: null,
        taskId: notification.taskId ?? null,
        taskTitle: notification.taskTitle ?? null,
        at,
      });
    }

    return { created: count };
  }

  /**
   * La bandeja de una persona.
   *
   * No se cachea: cambia con cualquier cosa que haga cualquiera de sus
   * proyectos, y la clave tendría que depender de la query entera. Los dos
   * índices por `userId` la hacen barata.
   *
   * `unread` viaja **siempre**, también cuando se piden solo las no leídas: es
   * lo que pinta la insignia de la barra lateral, y calcularlo desde `items`
   * daría un número tapado por el `limit`.
   */
  async findMine(dto: FindNotificationsDto) {
    const where = {
      userId: dto.userId,
      ...(dto.unreadOnly && { readAt: null }),
    };

    const limit = dto.limit ?? DEFAULT_LIMIT;
    const page = dto.page ?? 1;

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: dto.userId, readAt: null } }),
    ]);

    return { items, total, unread };
  }

  /**
   * Marca una como leída.
   *
   * El `userId` va en el `where`, no en una comprobación previa: así no existe
   * el hueco entre leer y escribir, y marcar la de otro no encuentra fila en vez
   * de encontrarla y rechazarla.
   *
   * Es idempotente: volver a marcar una ya leída no toca `readAt`, para que la
   * fecha siga siendo la de la primera vez.
   */
  async markRead(dto: MarkNotificationReadDto) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: dto.id, userId: dto.userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (count === 0) {
      // O no es suya, o no existe, o ya estaba leída. Las tres se responden
      // igual: no se confirma la existencia de un aviso ajeno.
      const exists = await this.prisma.notification.findFirst({
        where: { id: dto.id, userId: dto.userId },
        select: { id: true },
      });
      if (!exists) {
        throw new RpcException({ statusCode: 404, message: 'Aviso no encontrado' });
      }
    }

    return { success: true };
  }

  /** El gesto de «ya lo he visto todo», que es como se vacía una bandeja. */
  async markAllRead(dto: MarkAllNotificationsReadDto) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: dto.userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { marked: count };
  }

  /**
   * Atajo para los emisores de dentro del servicio.
   *
   * Existe para que invitaciones y miembros no tengan que envolver cada aviso en
   * un array ni saber del DTO de bloque.
   */
  async emit(notification: CreateNotificationDto) {
    return this.createNotifications({ notifications: [notification] });
  }
}
