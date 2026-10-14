import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { ChatMessageOrigin, Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import type { ChannelContext } from '../realtime/events';
import { PushService } from '../push/push.service';
import { EventDispatcher } from '../realtime/event-dispatcher.service';
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
  pinnedAt: true,
  pinnedById: true,
  /* Si el mensaje fluye por la conversación o vive solo dentro de su hilo.
     El cliente **lo necesita** desde que los mensajes llegan por el flujo en
     vivo: es lo que decide si una respuesta nueva se inserta en el historial o
     en el panel del hilo. Sin esto, una respuesta de hilo aparecía en medio de
     la conversación general. */
  visibleEnChat: true,
  /* La lápida de un mensaje borrado. Va aquí porque el cliente **tiene** que
     poder distinguirla de un mensaje vacío: es lo que decide si se pinta la
     burbuja o el «Mensaje eliminado», y si el mensaje admite acciones. */
  deletedAt: true,
  /* De dónde vino (D13). La pantalla pinta un aviso de regla como divisor y
     un mensaje de PRAX con su marca; sin esto, los dos parecen de la persona. */
  origin: true,
  originMeta: true,
  reactions: true,
  /* `attachments` con solo el `mimeType`: es lo que necesita la cita para
     decir «📷 Imagen» en vez de un hueco vacío cuando el mensaje citado no
     tiene texto — un mensaje puede ser solo un archivo.

     `deletedAt` también: si el mensaje citado se borró, la cita tiene que decir
     «Mensaje eliminado» y no quedarse en blanco. */
  replyTo: {
    select: {
      id: true,
      authorId: true,
      body: true,
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
 * Las reacciones que se **ofrecen**.
 *
 * Una lista corta y cerrada, no texto libre: el emoji viaja en el cuerpo y acaba
 * en la base, así que dejarlo abierto es un campo más donde meter lo que sea.
 * Cinco caben en una fila sin desplegable y cubren aprobar, querer, reír,
 * sorprenderse y **discrepar** — esto último no lo cubría ninguna de las seis
 * anteriores. Espejo de `CHAT_REACTIONS` en `@praxis/contracts`.
 */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '👎'] as const;

/**
 * Las que se **aceptan**: las de arriba más las retiradas del selector.
 *
 * ⚠️ **Esta comprobación corre también al quitar una reacción**, así que
 * validar solo contra `REACTIONS` dejaba pegados para siempre los 🎉 y 🚀
 * que ya estaban guardados: el botón daba 400 y no había forma de retirarlos.
 * Los retirados se aceptan pero no los ofrece ningún cliente, así que se pueden
 * quitar y no se pueden volver a poner. Espejo de `CHAT_REACTIONS_ACEPTADAS`.
 */
export const ACCEPTED_REACTIONS = [...REACTIONS, '🎉', '👀', '🚀', '😄'] as const;

/**
 * Cuántos mensajes se pueden tener fijados a la vez en un canal.
 *
 * Fijar es «esto no se puede perder», y esa frase deja de significar nada
 * cuando lo dice de treinta mensajes: la barra se convierte en un segundo
 * historial que hay que recorrer, y quien entra no sabe por dónde empezar.
 *
 * Cinco es lo que cabe en la lista desplegable sin desplazamiento y lo bastante
 * poco para obligar a elegir. El tope se aplica **aquí y no en el navegador**:
 * dos pestañas fijando a la vez, o cualquiera llamando a la ruta a mano, se
 * saltarían un límite que solo viviera en la interfaz.
 */
export const MAX_PINNED = 5;

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
  private readonly log = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly channels: ChannelsService,
    private readonly attachments: ChatAttachmentsService,
    private readonly eventos: EventDispatcher,
    private readonly push: PushService,
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
    /**
     * De dónde vino (D13). **Solo llega por TCP**: el gateway no lo deja
     * pasar desde un cuerpo HTTP, así que aquí se confía en quien lo manda.
     */
    origin?: ChatMessageOrigin;
    originMeta?: Record<string, unknown> | null;
    /** Nombre de quien escribe, que pone el gateway (solo para el push). */
    authorName?: string | null;
  }) {
    /* Una respuesta tiene que apuntar a un mensaje **de este mismo canal**. Sin
       esta comprobación, un id conocido de otra conversación se citaría dentro
       de esta y su texto saldría en la cita. */
    if (dto.replyToId) {
      const citado = await this.prisma.chatMessage.findUnique({
        where: { id: dto.replyToId },
        select: { channelId: true, deletedAt: true },
      });
      /* Tampoco se cita una lápida: la cita saldría vacía y quien responde
         creería estar contestando a algo que ya no existe. */
      if (!citado || citado.channelId !== dto.channelId || citado.deletedAt) {
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
        origin: dto.origin ?? 'USER',
        ...(dto.originMeta ? { originMeta: dto.originMeta as Prisma.InputJsonValue } : {}),
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
    /**
     * ⚠️ **El `.catch()` no sobra: esto es una escritura de Prisma.**
     *
     * No se espera a propósito —tu mensaje no tiene por qué tardar más porque
     * haya que mover tu marca de lectura—, y una promesa que se rechaza sin que
     * nadie la escuche es un `unhandledRejection`, que en Node **mata el
     * proceso** desde la v15. El `try` de este método no lo cubre: para cuando
     * el rechazo ocurre, la función ya salió de él.
     *
     * O sea que cualquier tropiezo de la base al mandar un mensaje —el pool
     * agotado, un `deadlock` con otra pestaña haciendo lo mismo— tumbaba
     * projects-service entero. Lo único que se pierde tragándolo es que tu
     * propio mensaje te cuente como no leído hasta que vuelvas a escribir o a
     * marcar leído; el mensaje ya está guardado.
     */
    this.touchRead(dto.channelId, dto.requesterId, message.createdAt).catch((error: unknown) =>
      this.log.warn(
        `No se pudo adelantar la marca de lectura de ${dto.requesterId} en ${dto.channelId}: ${(error as Error).message}`,
      ),
    );

    /* Se releen los adjuntos después de reclamarlos: los borradores recién
       atados al mensaje no estaban en la creación. */
    const conAdjuntos = await this.prisma.chatMessage.findUnique({
      where: { id: message.id },
      select: CON_MENSAJE,
    });
    const completo = conAdjuntos ?? message;

    /* ⚠️ **Se anuncia el mensaje ya completo, no el de la creación.** Con el de
       arriba, un mensaje enviado con archivos llegaba al otro extremo **sin
       ellos** —los adjuntos se reclaman después del `create`—, y no reaparecían
       hasta recargar. Es la clase de fallo que solo se ve con adjuntos y por eso
       es fácil que sobreviva a las pruebas manuales. */
    void this.anunciarMensaje(dto.channelId, completo, message.createdAt, dto.authorName ?? null);

    return completo;
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
    /**
     * Los mensajes **posteriores** a este, para resincronizar tras un corte.
     *
     * `before` sube por el historial; esto baja por lo que se perdió. Un
     * `EventSource` reconecta solo, pero lo publicado mientras la conexión
     * estaba caída no se reenvía: al volver, el cliente pide «lo que hay
     * después del último que tengo» y rellena el hueco con una sola petición,
     * en vez de recargar la conversación entera.
     */
    after?: string;
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
          /* Una lápida no se busca: su `body` está vacío, así que nunca casaría
             un término, pero se excluye explícitamente para que la intención
             quede escrita y no dependa de que el vaciado siga haciéndose. */
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
        channelId: dto.channelId,
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
          /* `delete` ya desfija al borrar, así que esto no debería descartar
             nada. Se deja porque la barra de fijados es lo único que ancla un
             mensaje **fuera** del historial: si alguna vez se colara una lápida
             ahí, se quedaría anclada para siempre y gastando una de las cinco
             plazas. */
          deletedAt: null,
          ...(estado?.hiddenAt && { createdAt: { gt: estado.hiddenAt } }),
        },
        orderBy: { pinnedAt: 'desc' },
        select: CON_MENSAJE,
      });

      return {
        channelId: dto.channelId,
        items: fijados,
        hasMore: false,
        unread: 0,
        muted: estado?.mutedAt !== null && estado?.mutedAt !== undefined,
      };
    }

    const limit = dto.limit ?? DEFAULT_LIMIT;

    /**
     * Lo que llegó **después** de un mensaje dado: el hueco de una desconexión.
     *
     * Se resuelve antes que el historial normal porque responde otra pregunta y
     * no admite `before` — pedir «lo anterior a X y posterior a Y» a la vez no
     * significa nada aquí.
     *
     * ⚠️ Sale en orden ascendente y **`hasMore` va siempre a `false`**: en el
     * historial normal significa «queda más hacia arriba», y aquí lo que puede
     * faltar está hacia abajo. Reutilizarlo diría lo contrario de lo que pasa.
     *
     * 🔴 **Para eso está `hasMoreAfter`, y antes no existía.** El hueco se
     * servía recortado a `limit` **sin decirlo**: una desconexión de más de
     * cincuenta mensajes dejaba al cliente pegando el trozo que le llegó al
     * final de lo que ya tenía, con el resto perdido para siempre y sin un solo
     * error. La conversación se quedaba con un agujero mudo en medio hasta que
     * alguien recargara —y nadie recarga, porque nada parece roto—.
     *
     * Ahora se piden `limit + 1` para saber si el hueco desbordó, se devuelven
     * `limit` y el campo lo dice. Quien recibe `true` no debe pegar nada: tiene
     * que recargar la conversación entera, que es lo único correcto cuando no
     * cabe lo que falta.
     */
    if (dto.after) {
      const desde = await this.prisma.chatMessage.findUnique({
        where: { id: dto.after },
        select: { createdAt: true, channelId: true },
      });
      /* Un cursor de otra conversación se ignora, igual que en `before`: sería
         una forma de leer un chat ajeno con un id que se conozca. */
      if (!desde || desde.channelId !== dto.channelId) {
        return {
          channelId: dto.channelId,
          items: [],
          hasMore: false,
          hasMoreAfter: false,
          unread: await this.countUnread(dto.channelId, dto.requesterId),
          muted: estado?.mutedAt !== null && estado?.mutedAt !== undefined,
        };
      }

      /**
       * ⚠️ **Los dos cortes se combinan, no se sobrescriben.**
       *
       * Escribir `createdAt: {gt: X}` y a continuación esparcir
       * `...(hiddenAt && { createdAt: {gt: hiddenAt} })` **pisa** la primera
       * clave: en JavaScript la última gana, y el filtro del cursor
       * desaparecía. Se toma el más tardío de los dos, que es lo que los dos
       * quieren decir juntos.
       *
       * ⚠️ Y **no se filtra `visibleEnChat`**: por aquí también tienen que
       * volver las respuestas de hilo que se perdieron. El cliente las reparte
       * —al historial o al panel del hilo— mirando ese mismo campo, que viaja
       * en cada mensaje.
       */
      const corte =
        estado?.hiddenAt && estado.hiddenAt > desde.createdAt ? estado.hiddenAt : desde.createdAt;

      /* Uno de más, igual que en el historial: es lo que permite saber si el
         hueco desbordó sin contar la tabla. No se devuelve. */
      const posteriores = await this.prisma.chatMessage.findMany({
        where: { channelId: dto.channelId, createdAt: { gt: corte } },
        orderBy: { createdAt: 'asc' },
        take: limit + 1,
        select: CON_MENSAJE,
      });

      const desbordado = posteriores.length > limit;

      return {
        channelId: dto.channelId,
        items: desbordado ? posteriores.slice(0, limit) : posteriores,
        hasMore: false,
        /* El hueco no cabía entero. Quien lo reciba **no puede pegar** estos
           mensajes al final de lo que tiene: falta lo de en medio. */
        hasMoreAfter: desbordado,
        unread: await this.countUnread(dto.channelId, dto.requesterId),
        muted: estado?.mutedAt !== null && estado?.mutedAt !== undefined,
      };
    }

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
        ...((cursorAt || estado?.hiddenAt) && {
          createdAt: {
            ...(cursorAt && { lt: cursorAt }),
            ...(estado?.hiddenAt && { gt: estado.hiddenAt }),
          },
        }),
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
      /* ⚠️ El canal viaja en la respuesta desde que el chat se actualiza por
         eventos: es con lo que el panel decide si un evento que llega es de la
         conversación que tiene abierta. Deducirlo de `items[0].channelId` no
         vale — una conversación recién empezada no tiene ni un mensaje. */
      channelId: dto.channelId,
      items: page.reverse(),
      hasMore,
      unread,
      muted: estado?.mutedAt !== null && estado?.mutedAt !== undefined,
    };
  }

  /**
   * Deja el canal por leído hasta ahora.
   *
   * Anuncia el corte de lectura, y eso sirve para **dos** cosas distintas:
   *
   * 1. A los demás, para mover los checks de «visto» de sus mensajes sin tener
   *    que volver a pedir los acuses.
   * 2. **A ti mismo, en tus otras sesiones.** Leer una conversación en el móvil
   *    tiene que apagar su contador en el portátil; sin este evento, la insignia
   *    se quedaba encendida en la otra pestaña hasta recargar.
   */
  async markRead(dto: { channelId: string; requesterId: string }) {
    const at = new Date();
    await this.touchRead(dto.channelId, dto.requesterId, at);

    void this.eventos.repartir(dto.channelId, () => ({
      tipo: 'chat.leido',
      channelId: dto.channelId,
      actorId: dto.requesterId,
      at: at.toISOString(),
      hasta: at.toISOString(),
    }));

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

    /* `deletedAt: null`: editar una lápida la resucitaría con texto nuevo, que
       es exactamente lo que un borrado tiene que impedir. Sin fila que casar, la
       respuesta es el mismo 404 que un mensaje ajeno. */
    const { count } = await this.prisma.chatMessage.updateMany({
      where: {
        id: dto.id,
        channelId: dto.channelId,
        authorId: dto.requesterId,
        deletedAt: null,
      },
      data: { body: cuerpo, editedAt: new Date() },
    });

    if (count === 0) {
      throw new RpcException({ statusCode: 404, message: 'Mensaje no encontrado' });
    }

    const editado = await this.prisma.chatMessage.findUnique({
      where: { id: dto.id },
      select: CON_MENSAJE,
    });

    /* ⚠️ Una edición **no se anunciaba a nadie**: el texto nuevo se guardaba y
       en el otro extremo seguía el viejo hasta recargar la página. Ahora viaja
       el texto ya editado, así que quien lo recibe no tiene que releer nada. */
    if (editado?.editedAt) {
      void this.eventos.repartir(dto.channelId, () => ({
        tipo: 'chat.editado',
        channelId: dto.channelId,
        actorId: dto.requesterId,
        at: editado.editedAt!.toISOString(),
        messageId: dto.id,
        body: editado.body,
        editedAt: editado.editedAt!.toISOString(),
      }));
    }

    return editado;
  }

  /**
   * Borra un mensaje, **dejando la lápida**.
   *
   * El `authorId` va en el `where` cuando no hay moderación, no en una
   * comprobación previa: así no existe el hueco entre leer y borrar, y borrar el
   * de otro **no encuentra fila** en vez de encontrarla y rechazarla.
   *
   * ## Qué se va y qué se queda
   *
   * Se va **todo el contenido**: el texto, las reacciones y los adjuntos con sus
   * bytes. Se queda la fila, con `deletedAt`, su autor y su hora.
   *
   * ⚠️ Esto era un `deleteMany` y la fila desaparecía. En una conversación eso
   * es un hueco mudo: quien la está leyendo ve que algo se ha movido y no sabe
   * si alguien borró un mensaje, si falló la carga o si nunca hubo nada. Y con
   * `replyTo` en `SetNull`, las respuestas que lo citaban se quedaban colgando
   * de una cita vacía. La lápida contesta esas dos preguntas sin conservar nada
   * de lo que se pidió borrar.
   *
   * ⚠️ **Y se desfija.** Un mensaje fijado que se borra tiene que salir de la
   * barra de fijados: si no, el canal se queda con un anclaje permanente a un
   * hueco, y encima gastando una de las cinco plazas.
   *
   * Todo en una transacción: un borrado a medias —texto fuera, adjuntos dentro—
   * sería peor que no haber borrado, porque parecería completo.
   */
  async delete(dto: {
    id: string;
    channelId: string;
    requesterId: string;
    canModerate: boolean;
  }) {
    /* Los adjuntos se resuelven antes de la transacción: sus bytes pueden estar
       fuera de la base (GCS), y eso no se puede deshacer con un rollback. */
    const objetivo = await this.prisma.chatMessage.findFirst({
      where: {
        id: dto.id,
        channelId: dto.channelId,
        deletedAt: null,
        ...(dto.canModerate ? {} : { authorId: dto.requesterId }),
      },
      select: { id: true, attachments: { select: { id: true } } },
    });

    if (!objetivo) {
      /* O no existe, o no es tuyo, o ya estaba borrado. Las tres se responden
         igual: no se confirma la existencia de un mensaje que no puedes tocar. */
      throw new RpcException({ statusCode: 404, message: 'Mensaje no encontrado' });
    }

    await this.prisma.$transaction([
      this.prisma.chatReaction.deleteMany({ where: { messageId: dto.id } }),
      this.prisma.chatAttachment.deleteMany({ where: { messageId: dto.id } }),
      this.prisma.chatMessage.update({
        where: { id: dto.id },
        data: {
          body: '',
          deletedAt: new Date(),
          /* Se desfija en el mismo gesto, y también se limpia quién lo fijó:
             ese dato solo tiene sentido mientras el mensaje está anclado. */
          pinnedAt: null,
          pinnedById: null,
        },
      }),
    ]);

    /* Los bytes del proveedor externo, **después** de confirmar en la base. Van
       fuera de la transacción porque GCS no participa en ella, y no lanzan:
       ver `borrarBytes`. */
    if (objetivo.attachments.length > 0) {
      await this.attachments.borrarBytes(objetivo.attachments.map((adjunto) => adjunto.id));
    }

    /* ⚠️ Un borrado tampoco se anunciaba. En el otro extremo el mensaje seguía
       entero —con su texto y sus archivos— hasta que a esa persona le diera por
       recargar, que es exactamente lo contrario de lo que un borrado promete. */
    void this.eventos.repartir(dto.channelId, () => ({
      tipo: 'chat.borrado',
      channelId: dto.channelId,
      actorId: dto.requesterId,
      at: new Date().toISOString(),
      messageId: dto.id,
    }));

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
    if (!(ACCEPTED_REACTIONS as readonly string[]).includes(dto.emoji)) {
      throw new RpcException({ statusCode: 400, message: 'Esa reacción no está permitida.' });
    }

    const mensaje = await this.prisma.chatMessage.findUnique({
      where: { id: dto.messageId },
      select: { channelId: true, deletedAt: true },
    });
    /* Una lápida no acepta reacciones: no hay nada a lo que reaccionar, y la
       interfaz ya no ofrece el botón. Se responde 404 igual que a un mensaje de
       otra conversación — el cliente no tiene por qué distinguirlos. */
    if (!mensaje || mensaje.channelId !== dto.channelId || mensaje.deletedAt) {
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

    /* ⚠️ Se anuncia **el delta y no la lista entera**, a propósito. Cada cliente
       ya aplica su propio delta local encima de lo que trajo el servidor (ver
       `reaccionesLocales` en `ChatPanel`), y mandar la lista completa pisaría esa
       corrección optimista con una foto que puede llegar desordenada respecto a
       otra reacción simultánea. Un delta —«fulano puso 👍»— es idempotente y se
       puede aplicar en cualquier orden. */
    void this.eventos.repartir(dto.channelId, () => ({
      tipo: 'chat.reaccion',
      channelId: dto.channelId,
      actorId: dto.requesterId,
      at: new Date().toISOString(),
      messageId: dto.messageId,
      emoji: dto.emoji,
      on: dto.on,
    }));

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
    /**
     * El tope de fijados, comprobado **antes** de escribir y solo al fijar.
     *
     * ⚠️ El `where` excluye el propio mensaje: sin eso, volver a fijar uno que
     * ya lo está contaría como el sexto y devolvería un error por una operación
     * que no cambia nada. Fijar es idempotente y tiene que seguir siéndolo.
     *
     * ⚠️ **Esto es una comprobación previa, así que hay una carrera**: dos
     * pestañas fijando a la vez con cuatro puestos pueden colar el sexto. Se
     * acepta a conciencia — la alternativa es un bloqueo de tabla o un índice
     * único artificial para defender un límite **de presentación**, no de
     * integridad. El peor caso es una barra con seis fijados hasta que alguien
     * quite uno, y ninguna consulta ni permiso depende de ese número.
     */
    if (dto.on) {
      const yaFijados = await this.prisma.chatMessage.count({
        where: {
          channelId: dto.channelId,
          pinnedAt: { not: null },
          deletedAt: null,
          id: { not: dto.messageId },
        },
      });

      if (yaFijados >= MAX_PINNED) {
        throw new RpcException({
          statusCode: 400,
          message: `Solo se pueden fijar ${MAX_PINNED} mensajes por conversación. Desfija alguno antes.`,
        });
      }
    }

    /* Se escribe con `updateMany` y el `channelId` en el `where` —no con un
       `findUnique` y luego un `update`— para que no exista el hueco entre
       comprobar y escribir: un id de otra conversación no encuentra fila y no
       hay nada que decidir. El `authorId` no limita: cualquiera que pueda
       entrar al chat puede fijar, igual que puede reaccionar.

       `deletedAt: null` para no poder anclar una lápida: quedaría en la barra
       para siempre, apuntando a un hueco y gastando una de las cinco plazas. */
    const resultado = await this.prisma.chatMessage.updateMany({
      where: { id: dto.messageId, channelId: dto.channelId, deletedAt: null },
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

    void this.eventos.repartir(dto.channelId, () => ({
      tipo: 'chat.fijado',
      channelId: dto.channelId,
      actorId: dto.requesterId,
      at: new Date().toISOString(),
      messageId: dto.messageId,
      pinned: Boolean(fijado?.pinnedAt),
      pinnedById: fijado?.pinnedById ?? null,
    }));

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
        where: { channelId: { in: ids }, visibleEnChat: true },
        orderBy: { createdAt: 'desc' },
        distinct: ['channelId'],
        /* `deletedAt` para que el resumen de la fila diga «Mensaje eliminado»
           en vez de quedarse en blanco: al borrar, `body` se vacía. */
        select: { channelId: true, body: true, authorId: true, createdAt: true, deletedAt: true },
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
      select: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            iconKey: true,
            imageUrl: true,
            color: true,
            /* Para que el directorio filtre los chats de proyecto por la
               organización activa, como el resto de la interfaz. */
            organizationId: true,
          },
        },
      },
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
        where: { channelId: { in: ids }, visibleEnChat: true },
        orderBy: { createdAt: 'desc' },
        distinct: ['channelId'],
        /* `deletedAt` para que el resumen de la fila diga «Mensaje eliminado»
           en vez de quedarse en blanco: al borrar, `body` se vacía. */
        select: { channelId: true, body: true, authorId: true, createdAt: true, deletedAt: true },
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
   *
   * ## 🔴 Por qué esto es un `LATERAL` y no el `GROUP BY` de antes (E6.2)
   *
   * La versión anterior agrupaba sobre todos los mensajes de los canales pedidos
   * y filtraba después. Eso significa que **contar «3 sin leer» costaba leer el
   * historial entero del canal**: el coste no dependía de lo que falta por leer
   * sino de todo lo que se ha hablado ahí desde siempre. Es la consulta que se
   * ejecuta al abrir la bandeja y al pintar el directorio, o sea de las más
   * frecuentes del sistema, y la única que empeora sola con el uso.
   *
   * ⚠️ **Lo que lo bloqueaba no era la falta de un índice**: el índice
   * `(channelId, createdAt)` ya existía. Era el `OR s."lastReadAt" IS NULL`, que
   * impide a Postgres usar la comparación como condición de rango — con un `OR`
   * ahí, la única opción es leerlo todo y filtrar. Sustituirlo por un
   * `COALESCE(..., '-infinity')` deja una comparación simple, y el plan pasa a
   * ser un recorrido de índice acotado por `createdAt`.
   *
   * **Medido** con 300.000 mensajes en 500 canales y una lectura realista —casi
   * todo leído, unos pocos pendientes—, pidiendo 20 canales:
   *
   * | | Antes (`GROUP BY`) | Ahora (`LATERAL`) |
   * |---|---|---|
   * | Filas leídas | 11.700 | 18 |
   * | Buffers | 817 | 109 |
   * | Tiempo | 3,96 ms | **0,73 ms** |
   *
   * Y la diferencia **crece con el historial**: la de antes es O(mensajes del
   * canal) y esta es O(mensajes sin leer).
   *
   * ⚠️ `WHERE u.unread > 0` mantiene el contrato de la de antes: el `GROUP BY`
   * tampoco devolvía fila para un canal sin mensajes que contar, y quien llama
   * hace `?? 0`.
   */
  private async contarSinLeerDeVarios(
    channelIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    const filas = await this.prisma.$queryRaw<{ channelId: string; unread: bigint }[]>`
      SELECT c.id AS "channelId", u.unread
      FROM unnest(${channelIds}::text[]) AS c(id)
      LEFT JOIN "projects"."chat_channel_states" s
        ON s."channelId" = c.id AND s."userId" = ${userId}
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS unread
        FROM "projects"."chat_messages" m
        WHERE m."channelId" = c.id
          AND m."authorId" <> ${userId}
          AND m."createdAt" > COALESCE(s."lastReadAt", '-infinity'::timestamp)
      ) u
      WHERE u.unread > 0
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
   * Anuncia un mensaje nuevo **con el mensaje dentro**.
   *
   * ## Qué cambia respecto a lo que había
   *
   * Esto era `notifyOthers` y publicaba un aviso sin contenido: solo «ha pasado
   * algo en un chat». El navegador no podía hacer nada con eso salvo
   * `router.refresh()`, y de ahí venían los dos fallos que parecían inconexos
   * —tu mensaje que a veces no se pintaba, y los hilos y contadores que no se
   * enteraban—. Explicación entera en `realtime/events.ts`.
   *
   * Tres diferencias concretas:
   *
   * 1. **Va el mensaje completo**, así que el cliente lo inserta sin pedir nada.
   * 2. **También se le manda al autor.** La misma persona puede tener el chat
   *    abierto en dos pestañas y en el móvil; sin el eco, esas sesiones no verían
   *    su propio mensaje hasta recargar. Que no suene lo decide el cliente
   *    comparando `actorId` consigo mismo — es presentación, no reparto.
   * 3. **A quien lo tenga silenciado también se le manda**, con `silenciado:
   *    true`. Antes no se le mandaba nada, lo cual valía cuando el evento solo
   *    servía para pitar; ahora lleva el mensaje, y no mandarlo significaría que
   *    una conversación silenciada deja de actualizarse sola.
   *
   * ⚠️ **El texto del mensaje viaja, pero la tarjeta emergente no lo enseña.**
   * Quien recibe el evento ya tiene permiso para leer el canal —es participante,
   * y la lista sale de la base—, así que no es una fuga; lo que no debe hacerse
   * es reproducirlo en una tarjeta que aparece sobre cualquier pantalla, y eso
   * lo decide `LiveNotices`.
   */
  private async anunciarMensaje(
    channelId: string,
    mensaje: { id: string; authorId: string; body?: string | null; deletedAt?: Date | null },
    at: Date,
    authorName: string | null,
  ) {
    /* Quién recibe un push: todos menos el autor y quien lo tiene silenciado. Se
       recoge aquí, dentro del reparto, porque es donde ya están resueltos los
       silencios y el contexto del canal. */
    const paraPush: string[] = [];
    const guardado: { canal: ChannelContext | null } = { canal: null };

    await this.eventos.repartir(channelId, (contexto) => {
      if (!contexto.silenciado && contexto.destinatario !== mensaje.authorId) {
        paraPush.push(contexto.destinatario);
      }
      guardado.canal = contexto;
      return {
        tipo: 'chat.mensaje',
        channelId,
        actorId: mensaje.authorId,
        at: at.toISOString(),
        mensaje,
        silenciado: contexto.silenciado,
        channelKind: contexto.channelKind,
        projectId: contexto.projectId,
        projectName: contexto.projectName,
        projectSlug: contexto.projectSlug,
        peerId: contexto.peerId,
        organizationId: contexto.organizationId,
        organizationName: contexto.organizationName,
      };
    });

    const canal = guardado.canal;
    if (paraPush.length === 0 || !canal) return;
    const texto = (mensaje.body ?? '').replace(/\s+/g, ' ').trim() || 'Te envió un archivo';
    const privado = canal.channelKind === 'DIRECT';
    /* En un privado el título es quien escribe y el cuerpo, solo el texto; en
       un grupo el título es el proyecto y cada línea lleva su autor. El service
       worker apila las últimas líneas de un mismo `tag` en una sola notificación. */
    this.push
      .avisarMensaje(paraPush, {
        title: privado
          ? (authorName ?? 'Mensaje privado')
          : (canal.projectName ?? 'Chat del proyecto'),
        body: privado ? texto.slice(0, 120) : `${authorName ?? 'Alguien'}: ${texto.slice(0, 120)}`,
        url: privado ? `/chat/${mensaje.authorId}` : `/chat/proyecto/${canal.projectId}`,
        tag: `chat:${channelId}`,
        acumular: true,
      })
      .catch(() => undefined);
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
