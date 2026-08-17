import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { canalDeAvisos } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ChannelsService } from './channels.service';
import { ChatAttachmentsService } from './chat-attachments.service';

/** Cuántos mensajes trae una página del historial si no se pide otra cosa. */
const DEFAULT_LIMIT = 50;

/**
 * Lo que se devuelve con cada mensaje, sin los bytes de los adjuntos.
 *
 * Es un `select` y no un `include` a propósito: `include` solo acepta relaciones
 * y hay que devolver escalares —`pinnedAt` y `pinnedById` entre ellos—. Con
 * `select` se enumeran los escalares que el cliente espera y las relaciones que
 * pinta. Si se añade una columna al modelo y no aparece aquí, se calla.
 */
const CON_MENSAJE = {
  id: true,
  channelId: true,
  authorId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  pinnedAt: true,
  pinnedById: true,
  reactions: true,
  /* `attachments` con solo el `mimeType`: es lo que necesita la cita para
     decir «📷 Imagen» en vez de un hueco vacío cuando el mensaje citado no
     tiene texto — un mensaje puede ser solo un archivo. */
  replyTo: {
    select: {
      id: true,
      authorId: true,
      body: true,
      /* Para que la cita pueda decir «Mensaje eliminado» cuando el citado se
         borró: sin el campo, el frente pintaría un adjunto que ya no se debe
         enseñar. */
      deletedAt: true,
      attachments: { select: { mimeType: true }, take: 1 },
    },
  },
  attachments: {
    select: {
      id: true,
      channelId: true,
      messageId: true,
      filename: true,
      mimeType: true,
      size: true,
      uploadedBy: true,
      createdAt: true,
    },
  },
  /* Cuántas respuestas tiene **su hilo**, no cuántas citas recibió: una
     respuesta desde el compositor principal cita con el mismo `replyToId`
     pero vive en la conversación general, y contarla aquí haría que el raíz
     dijera «1 respuesta» con el hilo vacío al abrirlo. */
  _count: { select: { replies: { where: { visibleEnChat: false } } } },
} as const;

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
 * El `type` con el que viaja un borrado por el flujo de avisos.
 *
 * Mismo canal que `CHAT_EVENT_TYPE` —el navegador lo escucha para **refrescar**
 * la conversación abierta y que el mensaje se vuelva «eliminado» delante de
 * quien lo estaba leyendo— pero **no pinta tarjeta ni suena**: el borrado ya se
 * ve en su sitio, y una tarjeta por cada borrado de una conversación viva sería
 * ruido. Es espejo de `CHAT_DELETED_EVENT_TYPE` en `commons/api/domain.ts`.
 */
export const CHAT_DELETED_EVENT_TYPE = 'CHAT_DELETED';

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
    private readonly attachments: ChatAttachmentsService,
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
    attachmentIds?: string[];
    /**
     * Si este mensaje se escribió dentro del panel del hilo.
     *
     * Es lo que separa «responder» de «hilo», y no `replyToId`: los dos
     * llevan cita, pero solo el que nace en el panel del hilo se guarda
     * fuera de la conversación general.
     */
    enHilo?: boolean;
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

    /* Un mensaje no puede quedarse vacío: o tiene texto, o lleva adjuntos. El
       `body` del DTO es opcional solo en el caso de que haya archivos, así que
       aquí se exige que haya al menos uno de los dos. */
    const attachmentIds = dto.attachmentIds ?? [];
    const cuerpo = dto.body?.trim() ?? '';
    if (cuerpo.length === 0 && attachmentIds.length === 0) {
      throw new RpcException({ statusCode: 400, message: 'Escribe algo antes de enviar.' });
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        channelId: dto.channelId,
        authorId: dto.requesterId,
        /* Se recorta el espacio de los extremos: un mensaje de solo espacios
           pasa el `MinLength(1)` del DTO y sale como una burbuja vacía. */
        body: cuerpo,
        replyToId: dto.replyToId ?? null,
        visibleEnChat: !dto.enHilo,
      },
      select: CON_MENSAJE,
    });

    if (attachmentIds.length > 0) {
      /* Todos o ninguno: si alguno no es de quien envía, o ya tiene mensaje, el
         mensaje entero se rechaza y el archivo se queda en borrador. Ver
         `ChatAttachmentsService.claim`. */
      await this.attachments.claim(message.id, dto.channelId, dto.requesterId, attachmentIds);
    }

    /**
     * Escribir es haber leído: se adelanta la marca del autor.
     *
     * Sin esto, tu propio mensaje te contaría como no leído en cuanto alguien
     * respondiera —el corte seguiría estando antes de lo que tú escribiste—.
     */
    void this.touchRead(dto.channelId, dto.requesterId, message.createdAt);
    void this.notifyOthers(dto.channelId, dto.requesterId, message.createdAt);

    /* Se releen los adjuntos después de reclamarlos: los borradores recién
       atados al mensaje no estaban en la creación. */
    const conAdjuntos = await this.prisma.chatMessage.findUnique({
      where: { id: message.id },
      select: CON_MENSAJE,
    });
    return conAdjuntos ?? message;
  }

  /**
   * El historial, del más antiguo al más nuevo.
   *
   * Se pide del revés a la base —los `limit` más recientes— y se le da la vuelta
   * antes de devolverlo: la consulta rápida es «los últimos N», que es el índice
   * leído hacia atrás, pero pintar una conversación se hace de arriba abajo.
   */
  async findAll(dto: {
    channelId: string;
    requesterId: string;
    limit?: number;
    before?: string;
    pinned?: boolean;
    q?: string;
  }) {
    const estado = await this.prisma.chatChannelState.findUnique({
      where: { channelId_userId: { channelId: dto.channelId, userId: dto.requesterId } },
      select: { mutedAt: true, hiddenAt: true },
    });

    /* La búsqueda se pide como una página aparte, no como un modo del
       historial: el término filtra el texto y el resultado se ordena del más
       reciente al más antiguo, como los fijados, sin cursor — un cursor sobre
       coincidencias salteadas no tendría sentido. Se ignora `before` y `pinned`
       a propósito. */
    if (dto.q?.trim()) {
      const termino = dto.q.trim();
      const limit = dto.limit ?? DEFAULT_LIMIT;
      const hallados = await this.prisma.chatMessage.findMany({
        where: {
          channelId: dto.channelId,
          /* Un mensaje solo del hilo no se busca desde aquí: vive fuera de la
             conversación general, y buscar dentro de un hilo se hace en su
             propio panel. */
          visibleEnChat: true,
          /* Un mensaje borrado no se busca: el texto ya se vació al borrarlo,
             y además no debe reaparecer por un término que escribió. */
          deletedAt: null,
          /* Insensible a mayúsculas: «Hoy» encuentra «hoy». El modo de Postgres,
             no una normalización que rompería el índice. */
          body: { contains: termino, mode: 'insensitive' },
          ...(estado?.hiddenAt && { createdAt: { gt: estado.hiddenAt } }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: CON_MENSAJE,
      });

      return {
        items: hallados,
        hasMore: false,
        unread: 0,
        muted: estado?.mutedAt !== null && estado?.mutedAt !== undefined,
      };
    }

    /* La lista de fijados se pide entera, sin paginar: cabe en pantalla y un
       cursor sobre algo así sería fricción sin beneficio. Se ignora `before` y
       `limit` a propósito (el gateway ya documenta lo mismo en el DTO). */
    if (dto.pinned) {
      const fijados = await this.prisma.chatMessage.findMany({
        where: {
          channelId: dto.channelId,
          visibleEnChat: true,
          pinnedAt: { not: null },
          /* En realidad un borrado limpia su `pinnedAt` al borrarse, pero un
             fijado pedido por un cliente viejo entre medias no debe colarse: el
             filtro es la red de seguridad. */
          deletedAt: null,
          ...(estado?.hiddenAt && { createdAt: { gt: estado.hiddenAt } }),
        },
        orderBy: { pinnedAt: 'desc' },
        select: CON_MENSAJE,
      });

      return {
        items: fijados,
        hasMore: false,
        unread: 0,
        muted: estado?.mutedAt !== null && estado?.mutedAt !== undefined,
      };
    }

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
        /* «Responder» y «abrir el hilo» ya no comparten mecanismo: los dos
           llevan cita (`replyToId`), pero solo lo que se escribe dentro del
           panel del hilo se guarda con `visibleEnChat: false` y se queda
           fuera de aquí. Una respuesta desde el compositor principal fluye
           en su sitio cronológico, como cualquier mensaje. */
        visibleEnChat: true,
        ...(cursorAt && { createdAt: { lt: cursorAt } }),
        ...(estado?.hiddenAt && { createdAt: { gt: estado.hiddenAt } }),
      },
      orderBy: { createdAt: 'desc' },
      /* Uno de más: sirve para saber si queda historial por encima sin tener que
         contar la tabla entera. No se devuelve. */
      take: limit + 1,
      select: CON_MENSAJE,
    });

    const hasMore = newest.length > limit;
    const page = hasMore ? newest.slice(0, limit) : newest;

    const [unread] = await Promise.all([this.countUnread(dto.channelId, dto.requesterId)]);

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
   * Un hilo: el mensaje que lo abre y sus respuestas.
   *
   * ## Qué es un hilo aquí
   *
   * Un hilo es un mensaje con respuestas, y una respuesta es un mensaje con
   * `replyToId` apuntando a él. **Las respuestas no fluyen por el historial**:
   * `findAll` filtra `replyToId: null`, así que en el chat solo se ve el raíz
   * con su marca «N respuestas» — las respuestas viven en este panel lateral.
   *
   * ⚠️ Solo las de **primer nivel**: una respuesta a una respuesta cuelga del
   * mensaje del medio, no de aquí. No hay hilos dentro de hilos — el árbol no
   * existe en el modelo, cada mensaje mira a uno solo.
   */
  async thread(dto: { messageId: string; channelId: string; requesterId: string }) {
    const raiz = await this.prisma.chatMessage.findUnique({
      where: { id: dto.messageId },
      select: { id: true, channelId: true },
    });
    /* Un id de otra conversación no encuentra hilo, igual que en el resto de
       operaciones: se comprueba el canal y se rechaza antes de leer nada. */
    if (!raiz || raiz.channelId !== dto.channelId) {
      throw new RpcException({ statusCode: 404, message: 'Mensaje no encontrado' });
    }

    const respuestas = await this.prisma.chatMessage.findMany({
      /* `visibleEnChat: false`: separación estricta con la conversación
         general. Una respuesta citada desde el compositor principal tiene el
         mismo `replyToId`, pero vive fuera del hilo — mostrarla aquí también
         sería tenerla en los dos sitios a la vez, que es justo lo que
         `enHilo` existe para impedir. */
      where: { replyToId: dto.messageId, channelId: dto.channelId, visibleEnChat: false },
      orderBy: { createdAt: 'asc' },
      select: CON_MENSAJE,
    });

    const root = await this.prisma.chatMessage.findUnique({
      where: { id: dto.messageId },
      select: CON_MENSAJE,
    });

    return { root, replies: respuestas };
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
   * Edita el texto de un mensaje propio.
   *
   * Solo el autor: aquí no hay moderación que valga, lo que se edita es tu
   * mensaje. El `authorId` va en el `where` del `updateMany` —igual que el
   * borrado— para que no exista el hueco entre comprobar y escribir, y editar el
   * de otro **no encuentra fila**.
   *
   * No se avisa por SSE: es una corrección, no un mensaje nuevo, y abrir una
   * notificación por cada reescritura sería ruido.
   */
  async edit(dto: {
    id: string;
    channelId: string;
    requesterId: string;
    body: string;
  }) {
    /* Se recorta el espacio de los extremos igual que en `send`: un cuerpo de
       solo espacios pasa el `MinLength(1)` del DTO y dejaría una burbuja vacía
       que antes no estaba. */
    const cuerpo = dto.body.trim();
    if (cuerpo.length === 0) {
      throw new RpcException({ statusCode: 400, message: 'Escribe algo antes de guardar.' });
    }

    const { count } = await this.prisma.chatMessage.updateMany({
      where: {
        id: dto.id,
        channelId: dto.channelId,
        authorId: dto.requesterId,
        /* Un mensaje borrado no se edita: su cuerpo ya se vació a propósito y
           rellenarlo lo haría reaparecer. */
        deletedAt: null,
      },
      data: { body: cuerpo, editedAt: new Date() },
    });

    if (count === 0) {
      throw new RpcException({ statusCode: 404, message: 'Mensaje no encontrado' });
    }

    return this.prisma.chatMessage.findUnique({
      where: { id: dto.id },
      select: CON_MENSAJE,
    });
  }

  /**
   * Borra un mensaje **para todos**.
   *
   * El `authorId` va en el `where` cuando no hay moderación, no en una
   * comprobación previa: así no existe el hueco entre leer y borrar, y borrar el
   * de otro **no encuentra fila** en vez de encontrarla y rechazarla.
   *
   * ⚠️ **Es un borrado suave, no físico.** La fila se queda con `deletedAt`
   * puesto, el `body` vacío y sin fijado — es lo que hace que los demás vean
   * «mensaje eliminado» en su sitio en vez de un hueco. Se vacía el cuerpo para
   * que ni la búsqueda ni el último mensaje de la bandeja sigan enseñando el
   * texto de algo que ya no se puede leer: el borrado tiene que ser para todos
   * de verdad, no solo para quien ya tenía la página abierta.
   *
   * Se avisa por el flujo de avisos igual que al escribir —sin esperarlo—:
   * es lo que le dice al resto de participantes que refresquen y conviertan la
   * burbuja en el marcador, aunque nadie esté mirando en ese momento.
   */
  async delete(dto: {
    id: string;
    channelId: string;
    requesterId: string;
    canModerate: boolean;
  }) {
    const { count } = await this.prisma.chatMessage.updateMany({
      where: {
        id: dto.id,
        channelId: dto.channelId,
        ...(dto.canModerate ? {} : { authorId: dto.requesterId }),
        /* Un mensaje ya borrado no se vuelve a borrar: sin esto, un `delete`
           repetido —un clic doble, una retransmisión— encontraría la fila y
           avisaría otra vez de un borrado que el resto ya vio. */
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        body: '',
        editedAt: null,
        pinnedAt: null,
        pinnedById: null,
      },
    });

    if (count === 0) {
      throw new RpcException({ statusCode: 404, message: 'Mensaje no encontrado' });
    }

    void this.notifyOthers(dto.channelId, dto.requesterId, new Date(), CHAT_DELETED_EVENT_TYPE);

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
   * Fija o desfija un mensaje.
   *
   * Fijar **no cambia el texto ni el autor**: deja el mensaje anclado a la
   * conversación —`pinnedAt` deja de ser nulo— y desfijar lo devuelve al
   * historial normal. Es idempotente en las dos direcciones, como las
   * reacciones: pedir fijar lo que ya está fijado no es un error.
   */
  async pin(dto: {
    messageId: string;
    channelId: string;
    requesterId: string;
    on: boolean;
  }) {
    /* Se escribe con `updateMany` y el `channelId` en el `where` —no con un
       `findUnique` y luego un `update`— para que no exista el hueco entre
       comprobar y escribir: un id de otra conversación no encuentra fila y no
       hay nada que decidir. El `authorId` no limita: cualquiera que pueda
       entrar al chat puede fijar, igual que puede reaccionar. */
    const resultado = await this.prisma.chatMessage.updateMany({
      where: { id: dto.messageId, channelId: dto.channelId },
      data: {
        pinnedAt: dto.on ? new Date() : null,
        pinnedById: dto.on ? dto.requesterId : null,
      },
    });

    if (resultado.count === 0) {
      throw new RpcException({ statusCode: 404, message: 'Mensaje no encontrado' });
    }

    const fijado = await this.prisma.chatMessage.findUnique({
      where: { id: dto.messageId },
      select: { id: true, pinnedAt: true, pinnedById: true },
    });

    return {
      messageId: dto.messageId,
      pinned: Boolean(fijado?.pinnedAt),
      pinnedById: fijado?.pinnedById ?? null,
    };
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
        where: { channelId: { in: ids }, visibleEnChat: true, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        distinct: ['channelId'],
        select: { channelId: true, body: true, authorId: true, createdAt: true },
      }),
      this.contarSinLeerDeVarios(ids, userId),
      this.prisma.chatChannelState.findMany({
        where: { channelId: { in: ids }, userId },
        select: { channelId: true, mutedAt: true, hiddenAt: true },
      }),
    ]);

    const ultimoPorCanal = new Map(ultimos.map((m) => [m.channelId, m]));
    const estadoPorCanal = new Map(estados.map((e) => [e.channelId, e]));

    return (
      canales
        .map((canal) => {
          const ultimo = ultimoPorCanal.get(canal.id) ?? null;
          const estado = estadoPorCanal.get(canal.id);

          return {
            channelId: canal.id,
            /* Con quién hablas: el que no eres tú. */
            peerId: canal.directUserA === userId ? canal.directUserB : canal.directUserA,
            ultimo,
            unread: sinLeer.get(canal.id) ?? 0,
            muted: estado?.mutedAt !== null && estado?.mutedAt !== undefined,
            hiddenAt: estado?.hiddenAt,
          };
        })
        /* Filtra los canales que fueron borrados/ocultados. Un canal se oculta si no tiene 
           mensajes nuevos desde que se marcó hiddenAt. */
        .filter((canal) => {
          if (!canal.hiddenAt) return true;
          if (!canal.ultimo) return false; // Borrado y sin mensajes nuevos
          return canal.ultimo.createdAt > canal.hiddenAt;
        })
        /* Las conversaciones vivas arriba. Una sin mensajes —abierta y nunca
         usada— cae al final en vez de encabezar la lista por ser reciente. */
        .sort(
          (a, b) => (b.ultimo?.createdAt?.getTime() ?? 0) - (a.ultimo?.createdAt?.getTime() ?? 0),
        )
        .map(({ hiddenAt, ...rest }) => rest) // Quitar hiddenAt de la respuesta
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
        where: { channelId: { in: ids }, visibleEnChat: true, deletedAt: null },
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
        /* Un borrado no suma sin leer: quien no lo llegó a abrir no tiene que
           ver la insignia por algo que ya no existe. */
        deletedAt: null,
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
        AND m."deletedAt" IS NULL
        AND (s."lastReadAt" IS NULL OR m."createdAt" > s."lastReadAt")
      GROUP BY m."channelId"
    `;

    return new Map(filas.map((fila) => [fila.channelId, Number(fila.unread)]));
  }

  /**
   * Quién ha leído hasta dónde, para las burbujas de «visto».
   *
   * ## Sale de un dato que ya se guardaba
   *
   * No hay tabla de acuses por mensaje —serían tantas filas como mensajes por
   * personas, y para lo mismo—: `ChatChannelState.lastReadAt` ya dice hasta
   * cuándo ha leído cada quien, y con eso un mensaje está visto por alguien si
   * su `lastReadAt` es posterior a la fecha del mensaje. Lo calcula el
   * frontend, que es donde están los mensajes en pantalla.
   *
   * ⚠️ **Se excluye a quien pregunta.** Tu propia marca de lectura no dice nada
   * —acabas de abrir el canal— y de dejarla, cada mensaje saldría «visto por
   * ti», que es ruido.
   *
   * ⚠️ **Sin `lastReadAt` no sale en la lista.** Es «no ha abierto el canal
   * nunca», y devolverlo con `null` obligaría a filtrar lo mismo del otro lado.
   */
  async receipts(dto: { channelId: string; requesterId: string }) {
    const estados = await this.prisma.chatChannelState.findMany({
      where: {
        channelId: dto.channelId,
        userId: { not: dto.requesterId },
        lastReadAt: { not: null },
      },
      select: { userId: true, lastReadAt: true },
    });

    return estados.map((estado) => ({
      userId: estado.userId,
      lastReadAt: (estado.lastReadAt as Date).toISOString(),
    }));
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
  private async notifyOthers(
    channelId: string,
    authorId: string,
    at: Date,
    type: string = CHAT_EVENT_TYPE,
  ) {
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
        type,
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
  /**
   * Oculta un canal para un usuario, actualizando hiddenAt en ChatChannelState.
   * Si llegan nuevos mensajes después de hiddenAt, el chat reaparecerá.
   */
  async hideConversation(channelId: string, userId: string) {
    return this.prisma.chatChannelState.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, hiddenAt: new Date() },
      update: { hiddenAt: new Date() },
    });
  }
}
