/**
 * Lo que viaja por el canal de tiempo real, y por qué es un sobre con `tipo`.
 *
 * ## El problema que resuelve
 *
 * Por `avisos:<userId>` viajaba **un solo tipo de cosa** —un aviso de bandeja—
 * y los mensajes de chat se colaban por ahí disfrazados de aviso, con un `type`
 * de texto libre y **sin el mensaje dentro**. El navegador recibía «ha pasado
 * algo en un chat» y lo único que podía hacer con eso era llamar a
 * `router.refresh()` y volver a pedir la página entera.
 *
 * Eso no es tiempo real, son recargas disfrazadas, y traía dos fallos que
 * parecían inconexos:
 *
 * 1. **Tu propio mensaje a veces no se pintaba.** Al enviar, la Server Action
 *    llamaba a `revalidatePath`; a la vez, el evento de otra persona disparaba
 *    un `router.refresh()`. Las dos entran en la **misma cola de transición del
 *    App Router**, y en Next 16 una navegación encima de otra marca la anterior
 *    como descartada. Cuando perdía la tuya, el mensaje estaba guardado, le
 *    llegaba al otro extremo —que sí se refrescaba— y en tu pantalla no
 *    aparecía. De ahí que fuera «aleatorio».
 * 2. **Los hilos y los contadores no se enteraban de nada.** Un refresco repinta
 *    lo que renderiza el servidor; las respuestas de un hilo y la insignia de
 *    «Directos» viven en estado de cliente, así que se quedaban como estaban.
 *
 * ## La forma
 *
 * Cada evento lleva `tipo` en la raíz y **el dato completo dentro**, para que el
 * navegador pueda aplicar el cambio sin volver a preguntar nada. Un mensaje
 * nuevo trae el mensaje entero; una edición, el texto nuevo; un borrado, el id.
 *
 * ⚠️ **`tipo` es una lista cerrada y `NotificationType` no.** Son cosas
 * distintas: `tipo` dice *qué clase de evento es* (y de eso decide el
 * despachador del cliente), mientras que `aviso.notificacion.type` sigue siendo
 * el enum de la tabla `notifications`. Mezclarlos fue justo el origen del `type`
 * de texto libre de antes.
 *
 * ⚠️ **Este archivo tiene un espejo en el frontend**, en
 * `commons/realtime/tipos.ts`. Si se añade un evento aquí y no allí, el
 * navegador lo recibe y lo descarta en silencio.
 */

/** Lo que comparten todos los eventos de chat: de qué canal y quién lo provocó. */
interface BaseDeChat {
  /**
   * El canal, que es como el cliente decide si el evento le incumbe.
   *
   * ⚠️ Es el `channelId` y no el `projectId` ni el `peerId` a propósito: es el
   * único identificador que significa lo mismo para las dos partes de una
   * conversación privada. Con `peerId`, el emisor y el receptor tendrían que
   * comparar contra valores distintos.
   */
  channelId: string;
  /** Quién lo hizo. El cliente lo usa para no anunciarse a sí mismo. */
  actorId: string;
  /** Cuándo, en ISO. Para ordenar y para las marcas de lectura. */
  at: string;
  /**
   * Si lo provocó quien lo está recibiendo.
   *
   * Lo rellena `EventDispatcher.repartir` al publicar, porque es quien sabe
   * a quién va cada copia. Los emisores no lo ponen — y no deben: no conocen al
   * destinatario.
   */
  mio?: boolean;
}

/**
 * A dónde lleva la tarjeta emergente de un chat.
 *
 * Va **por evento y no lo deduce el cliente** porque un mensaje privado no tiene
 * proyecto y uno de equipo no tiene interlocutor: sin esto, los dos serían
 * indistinguibles de un evento al que le faltan datos.
 */
export interface ChannelContext {
  channelKind: 'PROJECT' | 'DIRECT';
  projectId: string | null;
  projectName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  projectSlug: string | null;
  /**
   * En una conversación privada, **la otra persona vista desde quien recibe**.
   *
   * ⚠️ Se calcula por destinatario, no una vez para todos: para quien recibe es
   * el autor, y para el autor —que también recibe su propio eco, ver
   * `chat.mensaje`— es el destinatario. Un solo valor para los dos mandaría a
   * uno de ellos a su propia conversación consigo mismo.
   */
  peerId: string | null;
}

/** Un mensaje nuevo, con el mensaje entero dentro. */
export interface ChatMessageEvent extends BaseDeChat, ChannelContext {
  tipo: 'chat.mensaje';
  /** El mensaje tal cual lo devuelve `CON_MENSAJE`. Se pinta sin pedir nada más. */
  mensaje: unknown;
  /**
   * Si quien recibe tiene silenciada esta conversación.
   *
   * ⚠️ **El evento se manda igual, y eso es un cambio.** Antes, a quien lo
   * tuviera silenciado **no se le enviaba nada**, lo cual estaba bien cuando el
   * evento solo servía para hacer sonar un pitido. Ahora lleva el mensaje: no
   * mandarlo significaría que una conversación silenciada deja de actualizarse
   * sola, que no es lo que nadie entiende por «silenciar». Se manda el dato y se
   * marca que no debe hacer ruido.
   */
  silenciado: boolean;
}

/** Un mensaje reescrito. Lleva el texto nuevo, no hace falta releer. */
export interface EditedEvent extends BaseDeChat {
  tipo: 'chat.editado';
  messageId: string;
  body: string;
  editedAt: string;
}

/** Un mensaje borrado. El cliente lo convierte en lápida en su sitio. */
export interface DeletedEvent extends BaseDeChat {
  tipo: 'chat.borrado';
  messageId: string;
}

/** Una reacción puesta o quitada. */
export interface ReactionEvent extends BaseDeChat {
  tipo: 'chat.reaccion';
  messageId: string;
  emoji: string;
  /** `true` la pone, `false` la quita. */
  on: boolean;
}

/** Un mensaje fijado o desfijado. */
export interface PinnedEvent extends BaseDeChat {
  tipo: 'chat.fijado';
  messageId: string;
  pinned: boolean;
  pinnedById: string | null;
}

/**
 * Alguien ha leído hasta un punto de la conversación.
 *
 * Sirve para dos cosas a la vez: mover los checks de «visto» de los demás, y
 * —cuando el actor eres tú desde otra pestaña— poner a cero tu propio contador
 * de no leídos sin tener que preguntarlo.
 */
export interface ReadEvent extends BaseDeChat {
  tipo: 'chat.leido';
  /** Hasta cuándo ha leído, en ISO. Es el `lastReadAt` que se acaba de guardar. */
  hasta: string;
}

/**
 * Un aviso de la bandeja: una invitación, una tarea asignada, una baja.
 *
 * ⚠️ **Esto sí deja fila en `notifications` y un mensaje de chat no.** Cincuenta
 * mensajes serían cincuenta avisos por persona, y el aviso que de verdad importa
 * se perdería entre ellos.
 */
export interface NoticeEvent {
  tipo: 'aviso';
  type: string;
  actorId: string | null;
  projectId: string | null;
  projectName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  projectSlug: string | null;
  taskId: string | null;
  taskTitle: string | null;
  at: string;
}

export type LiveEvent =
  | ChatMessageEvent
  | EditedEvent
  | DeletedEvent
  | ReactionEvent
  | PinnedEvent
  | ReadEvent
  | NoticeEvent;

/**
 * El canal de Redis de una persona.
 *
 * ⚠️ **Uno por usuario, con el `userId` en el nombre**, y no uno global con el
 * destinatario dentro del cuerpo. El aislamiento lo hace Redis, no un filtro
 * nuestro: un emisor que se equivocara al rellenar el cuerpo no puede colar un
 * evento en la conexión de otra persona. El gateway extrae el `userId` **del
 * nombre del canal por el que llegó**, nunca del contenido.
 */
export function liveEventChannel(userId: string): string {
  return `avisos:${userId}`;
}
