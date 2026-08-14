import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { canalDeAvisos } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ChannelsService } from './channels.service';

/** Cuántos mensajes trae una página del historial si no se pide otra cosa. */
const DEFAULT_LIMIT = 50;

/**
 * Las reacciones que se aceptan.
 *
 * Una lista corta y cerrada, no texto libre: el emoji viaja en la URL y acaba en
 * la base, así que dejarlo abierto es un campo más donde meter lo que sea. Seis
 * cubren lo que la gente usa de verdad y caben en una fila sin desplegable.
 */
export const REACCIONES = ['👍', '🎉', '❤️', '👀', '🚀', '😄'] as const;

/**
 * El `type` del aviso en vivo de un mensaje nuevo.
 *
 * ⚠️ **No es un `NotificationType` y no debe serlo.** Ese enum es el de la tabla
 * `notifications`, y meter aquí los mensajes de chat llenaría la bandeja: una
 * conversación de cincuenta mensajes serían cincuenta avisos por persona, y el
 * aviso que de verdad importa —te han asignado una tarea— se perdería entre ellos.
 *
 * El canal de Redis transporta `type` como texto libre, así que un mensaje viaja
 * por el mismo flujo SSE que los avisos —y así suena y sale en pantalla estés
 * donde estés— **sin dejar ninguna fila detrás**.
 */
export const CHAT_EVENT_TYPE = 'CHAT_MESSAGE';

/**
 * Lo que se ha dicho en un canal.
 *
 * ## Quién puede entrar no se decide aquí
 *
 * Lo resuelve `ChannelsService` —para los privados— y `ProjectPermissionGuard`
 * en el gateway —para los de proyecto—. Este servicio da por hecho que el
 * `channelId` que recibe ya está autorizado.
 *
 * Lo que **sí** es responsabilidad de aquí es a quién se le avisa: la lista de
 * destinatarios sale de la base, nunca de lo que traiga la petición.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly channels: ChannelsService,
  ) {}

  /**
   * Escribe un mensaje y avisa a quien no lo escribió.
   *
   * El aviso sale **después** de guardar y sin esperarlo (`void`), igual que en
   * `NotificationsService`: que Redis esté caído degrada el tiempo real y nada
   * más, porque el mensaje ya está en la base y aparece al recargar.
   */
  async send(dto: {
    channelId: string;
    requesterId: string;
    body: string;
    replyToId?: string | null;
  }) {
    /* Una respuesta tiene que apuntar a un mensaje **de este mismo canal**. Sin
       esta comprobación, un id conocido de otra conversación se citaría dentro
       de esta y su texto saldría en la cita. */
    if (dto.replyToId) {
      const citado = await this.prisma.chatMessage.findUnique({
        where: { id: dto.replyToId },
        select: { channelId: true },
      });
      if (!citado || citado.channelId !== dto.channelId) {
        throw new RpcException({
          statusCode: 400,
          message: 'Ese mensaje no es de esta conversación.',
        });
      }
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        channelId: dto.channelId,
        authorId: dto.requesterId,
        /* Se recorta el espacio de los extremos: un mensaje de solo espacios
           pasa el `MinLength(1)` del DTO y sale como una burbuja vacía. */
        body: dto.body.trim(),
        replyToId: dto.replyToId ?? null,
      },
      include: { reactions: true, replyTo: { select: { id: true, authorId: true, body: true } } },
    });

    /**
     * Escribir es haber leído: se adelanta la marca del autor.
     *
     * Sin esto, tu propio mensaje te contaría como no leído en cuanto alguien
     * respondiera —el corte seguiría estando antes de lo que tú escribiste—.
     */
    void this.touchRead(dto.channelId, dto.requesterId, message.createdAt);
    void this.notifyOthers(dto.channelId, dto.requesterId, message.createdAt);

    return message;
  }

  /**
   * El historial, del más antiguo al más nuevo.
   *
   * Se pide del revés a la base —los `limit` más recientes— y se le da la vuelta
   * antes de devolverlo: la consulta rápida es «los últimos N», que es el índice
   * leído hacia atrás, pero pintar una conversación se hace de arriba abajo.
   */
  async findAll(dto: { channelId: string; requesterId: string; limit?: number; before?: string }) {
    const limit = dto.limit ?? DEFAULT_LIMIT;

    /* El cursor es un mensaje, no una página: en un chat el número de página de
       un mensaje cambia cada vez que alguien escribe. Se traduce a su instante,
       que es lo que ordena. */
    let cursorAt: Date | undefined;
    if (dto.before) {
      const previous = await this.prisma.chatMessage.findUnique({
        where: { id: dto.before },
        select: { createdAt: true, channelId: true },
      });
      /* Un cursor de otra conversación se ignora en vez de aceptarse: sería una
         forma de paginar por un chat ajeno usando un id que se conozca. */
      if (previous && previous.channelId === dto.channelId) cursorAt = previous.createdAt;
    }

    const newest = await this.prisma.chatMessage.findMany({
      where: {
        channelId: dto.channelId,
        ...(cursorAt && { createdAt: { lt: cursorAt } }),
      },
      orderBy: { createdAt: 'desc' },
      /* Uno de más: sirve para saber si queda historial por encima sin tener que
         contar la tabla entera. No se devuelve. */
      take: limit + 1,
      include: { reactions: true, replyTo: { select: { id: true, authorId: true, body: true } } },
    });

    const hasMore = newest.length > limit;
    const page = hasMore ? newest.slice(0, limit) : newest;

    const [unread, estado] = await Promise.all([
      this.countUnread(dto.channelId, dto.requesterId),
      this.prisma.chatChannelState.findUnique({
        where: { channelId_userId: { channelId: dto.channelId, userId: dto.requesterId } },
        select: { mutedAt: true },
      }),
    ]);

    return {
      items: page.reverse(),
      hasMore,
      unread,
      muted: estado?.mutedAt !== null && estado?.mutedAt !== undefined,
    };
  }

  /** Deja el canal por leído hasta ahora. */
  async markRead(dto: { channelId: string; requesterId: string }) {
    await this.touchRead(dto.channelId, dto.requesterId, new Date());
    return { ok: true };
  }

  /**
   * Silencia o devuelve el sonido a un canal.
   *
   * Silenciar **no deja de contar lo no leído**: la insignia sigue apareciendo.
   * Lo que se apaga es el aviso que interrumpe —la tarjeta y el sonido—, que es
   * lo que molesta en una conversación muy hablada. Confundir las dos cosas
   * dejaría a alguien sin enterarse nunca de un chat que sí quiere leer.
   */
  async setMuted(dto: { channelId: string; requesterId: string; muted: boolean }) {
    const mutedAt = dto.muted ? new Date() : null;

    await this.prisma.chatChannelState.upsert({
      where: { channelId_userId: { channelId: dto.channelId, userId: dto.requesterId } },
      create: { channelId: dto.channelId, userId: dto.requesterId, mutedAt },
      update: { mutedAt },
    });

    return { muted: dto.muted };
  }

  /**
   * Borra un mensaje.
   *
   * El `authorId` va en el `where` cuando no hay moderación, no en una
   * comprobación previa: así no existe el hueco entre leer y borrar, y borrar el
   * de otro **no encuentra fila** en vez de encontrarla y rechazarla.
   */
  async delete(dto: {
    id: string;
    channelId: string;
    requesterId: string;
    canModerate: boolean;
  }) {
    const { count } = await this.prisma.chatMessage.deleteMany({
      where: {
        id: dto.id,
        channelId: dto.channelId,
        ...(dto.canModerate ? {} : { authorId: dto.requesterId }),
      },
    });

    if (count === 0) {
      throw new RpcException({ statusCode: 404, message: 'Mensaje no encontrado' });
    }

    return { id: dto.id, deleted: true };
  }

  /**
   * Pone o quita una reacción.
   *
   * Es **idempotente en las dos direcciones**: reaccionar dos veces con lo mismo
   * deja una sola fila —lo garantiza la clave primaria— y quitar algo que no
   * está no es un error. Un botón que se pulsa dos veces por nervios no debe
   * responder distinto la segunda.
   */
  async react(dto: {
    messageId: string;
    channelId: string;
    requesterId: string;
    emoji: string;
    on: boolean;
  }) {
    if (!(REACCIONES as readonly string[]).includes(dto.emoji)) {
      throw new RpcException({ statusCode: 400, message: 'Esa reacción no está permitida.' });
    }

    const mensaje = await this.prisma.chatMessage.findUnique({
      where: { id: dto.messageId },
      select: { channelId: true },
    });
    if (!mensaje || mensaje.channelId !== dto.channelId) {
      throw new RpcException({ statusCode: 404, message: 'Mensaje no encontrado' });
    }

    if (dto.on) {
      await this.prisma.chatReaction
        .create({
          data: { messageId: dto.messageId, userId: dto.requesterId, emoji: dto.emoji },
        })
        /* El choque con la clave primaria significa que ya estaba puesta, que es
           el resultado que se buscaba. */
        .catch(() => undefined);
    } else {
      await this.prisma.chatReaction.deleteMany({
        where: { messageId: dto.messageId, userId: dto.requesterId, emoji: dto.emoji },
      });
    }

    const reactions = await this.prisma.chatReaction.findMany({
      where: { messageId: dto.messageId },
    });

    return { messageId: dto.messageId, reactions };
  }

  /**
   * Mis conversaciones privadas, con el último mensaje y lo que llevo sin leer.
   *
   * ⚠️ Lo no leído se cuenta con **una sola consulta para todas**, no una por
   * conversación: cada una tiene su propio corte de lectura, así que un
   * `groupBy` de Prisma no puede expresarlo y la alternativa ingenua es un
   * `count` por fila. Con veinte conversaciones son veinte viajes a la base para
   * pintar unos números.
   */
  async misConversaciones(userId: string) {
    const canales = await this.prisma.chatChannel.findMany({
      where: { kind: 'DIRECT', OR: [{ directUserA: userId }, { directUserB: userId }] },
      select: { id: true, directUserA: true, directUserB: true },
    });
    if (canales.length === 0) return [];

    const ids = canales.map((canal) => canal.id);

    const [ultimos, sinLeer, estados] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { channelId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        distinct: ['channelId'],
        select: { channelId: true, body: true, authorId: true, createdAt: true },
      }),
      this.contarSinLeerDeVarios(ids, userId),
      this.prisma.chatChannelState.findMany({
        where: { channelId: { in: ids }, userId },
        select: { channelId: true, mutedAt: true },
      }),
    ]);

    const ultimoPorCanal = new Map(ultimos.map((m) => [m.channelId, m]));
    const silenciados = new Map(estados.map((e) => [e.channelId, e.mutedAt !== null]));

    return (
      canales
        .map((canal) => ({
          channelId: canal.id,
          /* Con quién hablas: el que no eres tú. */
          peerId: canal.directUserA === userId ? canal.directUserB : canal.directUserA,
          ultimo: ultimoPorCanal.get(canal.id) ?? null,
          unread: sinLeer.get(canal.id) ?? 0,
          muted: silenciados.get(canal.id) ?? false,
        }))
        /* Las conversaciones vivas arriba. Una sin mensajes —abierta y nunca
         usada— cae al final en vez de encabezar la lista por ser reciente. */
        .sort(
          (a, b) => (b.ultimo?.createdAt?.getTime() ?? 0) - (a.ultimo?.createdAt?.getTime() ?? 0),
        )
    );
  }

  /**
   * Los chats de proyecto de esta persona, para la bandeja del centro de
   * mensajes.
   *
   * ⚠️ Sale de `project_members`, **no de los canales existentes**: un proyecto
   * al que acabas de entrar y en el que nadie ha escrito todavía no tiene canal
   * —se crea al primer mensaje— y aun así tiene que aparecer en la lista. Al
   * revés se quedaría fuera justo cuando más falta hace verlo.
   */
  async misChatsDeProyecto(userId: string) {
    const membresias = await this.prisma.projectMember.findMany({
      where: { userId, project: { status: { not: 'DELETED' } } },
      select: { project: { select: { id: true, name: true, slug: true } } },
      orderBy: { joinedAt: 'desc' },
    });
    if (membresias.length === 0) return [];

    const projectIds = membresias.map((membresia) => membresia.project.id);

    const canales = await this.prisma.chatChannel.findMany({
      where: { kind: 'PROJECT', projectId: { in: projectIds } },
      select: { id: true, projectId: true },
    });
    const canalPorProyecto = new Map(canales.map((canal) => [canal.projectId as string, canal.id]));
    const ids = canales.map((canal) => canal.id);

    /* Sin ni un canal creado no hay nada que contar: se devuelven los proyectos
       pelados. Salir aquí evita además tres consultas con `IN ()` vacío. */
    if (ids.length === 0) {
      return membresias.map((membresia) => ({
        channelId: null,
        project: membresia.project,
        ultimo: null,
        unread: 0,
        muted: false,
      }));
    }

    const [ultimos, sinLeer, estados] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { channelId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        distinct: ['channelId'],
        select: { channelId: true, body: true, authorId: true, createdAt: true },
      }),
      this.contarSinLeerDeVarios(ids, userId),
      this.prisma.chatChannelState.findMany({
        where: { channelId: { in: ids }, userId },
        select: { channelId: true, mutedAt: true },
      }),
    ]);

    const ultimoPorCanal = new Map(ultimos.map((mensaje) => [mensaje.channelId, mensaje]));
    const silenciados = new Map(
      estados.map((estado) => [estado.channelId, estado.mutedAt !== null]),
    );

    return (
      membresias
        .map((membresia) => {
          const channelId = canalPorProyecto.get(membresia.project.id) ?? null;
          return {
            channelId,
            project: membresia.project,
            ultimo: channelId ? (ultimoPorCanal.get(channelId) ?? null) : null,
            unread: channelId ? (sinLeer.get(channelId) ?? 0) : 0,
            muted: channelId ? (silenciados.get(channelId) ?? false) : false,
          };
        })
        /* Los que tienen conversación viva arriba; los mudos, después, por orden
         de entrada. Un proyecto sin mensajes no debe encabezar la lista solo por
         ser el más nuevo. */
        .sort(
          (a, b) => (b.ultimo?.createdAt?.getTime() ?? 0) - (a.ultimo?.createdAt?.getTime() ?? 0),
        )
    );
  }

  /* ─── Interno ─────────────────────────────────────────────────────── */

  /** Los propios nunca cuentan: nadie tiene pendiente de leer lo que escribió. */
  private async countUnread(channelId: string, userId: string): Promise<number> {
    const estado = await this.prisma.chatChannelState.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { lastReadAt: true },
    });

    return this.prisma.chatMessage.count({
      where: {
        channelId,
        authorId: { not: userId },
        ...(estado?.lastReadAt && { createdAt: { gt: estado.lastReadAt } }),
      },
    });
  }

  /**
   * Lo mismo para varios canales de una vez.
   *
   * `LEFT JOIN` y no `JOIN`: quien nunca abrió una conversación no tiene fila de
   * estado, y con un `JOIN` esa —que es justo la que lo tiene todo sin leer— se
   * caería del resultado y saldría con un cero.
   */
  private async contarSinLeerDeVarios(
    channelIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    const filas = await this.prisma.$queryRaw<{ channelId: string; unread: bigint }[]>`
      SELECT m."channelId", COUNT(*) AS unread
      FROM "projects"."chat_messages" m
      LEFT JOIN "projects"."chat_channel_states" s
        ON s."channelId" = m."channelId" AND s."userId" = ${userId}
      WHERE m."channelId" = ANY(${channelIds})
        AND m."authorId" <> ${userId}
        AND (s."lastReadAt" IS NULL OR m."createdAt" > s."lastReadAt")
      GROUP BY m."channelId"
    `;

    return new Map(filas.map((fila) => [fila.channelId, Number(fila.unread)]));
  }

  /**
   * Adelanta la marca de lectura, **nunca la retrasa**.
   *
   * Dos pestañas abiertas pueden pedir esto en cualquier orden, y una que llegue
   * tarde con un instante viejo volvería a poner mensajes como no leídos. El
   * `where` del `updateMany` es lo que lo impide.
   */
  private async touchRead(channelId: string, userId: string, at: Date) {
    const { count } = await this.prisma.chatChannelState.updateMany({
      where: { channelId, userId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: at } }] },
      data: { lastReadAt: at },
    });
    if (count > 0) return;

    /* No había fila, o la que hay ya es más nueva. Crear puede chocar con otra
       pestaña haciendo lo mismo; el choque significa que ya existe, y entonces
       el `updateMany` de arriba ya dijo lo que había que decir. */
    await this.prisma.chatChannelState
      .create({ data: { channelId, userId, lastReadAt: at } })
      .catch(() => undefined);
  }

  /**
   * Publica el aviso en vivo para todos los del canal menos quien escribió.
   *
   * ⚠️ Los destinatarios salen de la base, **no de la petición**: el canal de
   * Redis lleva el `userId` en su nombre y es lo único que separa la conexión de
   * una persona de la de otra, así que quién entra en esa lista es una decisión
   * de seguridad.
   *
   * ⚠️ **Quien lo tenga silenciado no recibe nada.** Se filtra aquí y no en el
   * navegador: un aviso que llega y se descarta al pintarlo ya ha sonado.
   *
   * No lleva el texto del mensaje. Un aviso emergente que reprodujera lo escrito
   * lo enseñaría en la pantalla de quien tenga el portátil abierto en una sala de
   * reuniones, y para leerlo ya está el chat, que comprueba permisos al entrar.
   */
  private async notifyOthers(channelId: string, authorId: string, at: Date) {
    const canal = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: {
        kind: true,
        directUserA: true,
        directUserB: true,
        project: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!canal) return;

    const destinatarios =
      canal.kind === 'DIRECT'
        ? [canal.directUserA === authorId ? canal.directUserB : canal.directUserA].filter(
            (id): id is string => Boolean(id),
          )
        : (
            await this.prisma.projectMember.findMany({
              where: { projectId: canal.project?.id, userId: { not: authorId } },
              select: { userId: true },
            })
          ).map((miembro) => miembro.userId);

    if (destinatarios.length === 0) return;

    const callados = new Set(
      (
        await this.prisma.chatChannelState.findMany({
          where: { channelId, userId: { in: destinatarios }, mutedAt: { not: null } },
          select: { userId: true },
        })
      ).map((estado) => estado.userId),
    );

    for (const destinatario of destinatarios) {
      if (callados.has(destinatario)) continue;

      void this.redis.publish(canalDeAvisos(destinatario), {
        type: CHAT_EVENT_TYPE,
        actorId: authorId,
        /* Distingue a dónde lleva la tarjeta: al chat del proyecto o a la
           conversación privada con quien escribió. */
        channelKind: canal.kind,
        projectId: canal.project?.id ?? null,
        projectName: canal.project?.name ?? null,
        projectSlug: canal.project?.slug ?? null,
        taskId: null,
        taskTitle: null,
        createdAt: at.toISOString(),
      });
    }
  }
}
