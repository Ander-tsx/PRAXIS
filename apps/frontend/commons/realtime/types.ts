import type { ChatMessage } from '../api/domain';

/**
 * Los eventos que llegan por el flujo en vivo.
 *
 * ⚠️ **Espejo de `realtime/events.ts` en projects-service.** Si allí se estrena
 * un `tipo` y aquí no, el navegador lo recibe y el despachador lo descarta en
 * silencio — no hay error, simplemente no pasa nada. Los dos archivos se tocan
 * juntos.
 *
 * ## Por qué el evento lleva el dato dentro
 *
 * Porque antes no lo llevaba. Por este canal viajaba «ha pasado algo en un
 * chat» y nada más, así que lo único que podía hacer el navegador era
 * `router.refresh()`: volver a pedir la página entera para enterarse de una
 * línea. Eso no es tiempo real, y traía dos fallos que parecían distintos:
 *
 * - **Tu propio mensaje a veces no aparecía.** El `revalidatePath` de la Server
 *   Action y el `router.refresh()` del evento de otra persona entran en la
 *   **misma cola de transición del App Router**, y en Next 16 una navegación
 *   encima de otra descarta la anterior. Cuando perdía la tuya, el mensaje
 *   estaba guardado, le llegaba al otro extremo —que sí se refrescaba— y en tu
 *   pantalla no salía.
 * - **Los hilos y los contadores no se enteraban.** Un refresco repinta lo que
 *   renderiza el servidor; las respuestas de un hilo abierto y la insignia de
 *   «Directos» viven en estado de cliente y se quedaban como estaban.
 *
 * Con el dato dentro, cada superficie aplica el cambio que le toca y no hay
 * refresco de ruta en el camino del chat.
 */

/** Lo que comparten todos los eventos de chat. */
interface BaseDeChat {
  /**
   * De qué conversación es.
   *
   * Es lo que cada panel compara para saber si el evento le incumbe. Va el
   * `channelId` y no el `projectId` ni el `peerId` porque es el único
   * identificador que significa lo mismo en los dos extremos de una
   * conversación privada.
   */
  channelId: string;
  /** Quién lo hizo. Se compara con uno mismo para no anunciarse a sí mismo. */
  actorId: string;
  at: string;
  /** El nombre de quien lo hizo, si el gateway pudo resolverlo. */
  actorName?: string | null;
  /**
   * Si lo provocó quien lo está recibiendo.
   *
   * ⚠️ **Lo resuelve el servidor**, que sabe a quién manda cada copia del
   * evento. Comparar `actorId === currentUserId` en el cliente significaría
   * repetir esa línea en cinco superficies, y basta con equivocarse en una para
   * anunciarse a uno mismo — o, peor, para no enterarse de lo ajeno.
   */
  mio: boolean;
}

/** A dónde lleva la tarjeta emergente de un chat. */
export interface ChannelContext {
  channelKind: 'PROJECT' | 'DIRECT';
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  /**
   * En una conversación privada, la otra persona **vista desde quien recibe**.
   *
   * El servidor lo calcula por destinatario, así que aquí siempre es «con quién
   * es esta conversación para mí», tanto si el mensaje es tuyo como si no.
   */
  peerId: string | null;
}

export interface ChatMessageEvent extends BaseDeChat, ChannelContext {
  tipo: 'chat.mensaje';
  mensaje: ChatMessage;
  /** Si tienes silenciada esta conversación: llega el dato, pero sin ruido. */
  silenciado: boolean;
}

export interface EditedEvent extends BaseDeChat {
  tipo: 'chat.editado';
  messageId: string;
  body: string;
  editedAt: string;
}

export interface DeletedEvent extends BaseDeChat {
  tipo: 'chat.borrado';
  messageId: string;
}

export interface ReactionEvent extends BaseDeChat {
  tipo: 'chat.reaccion';
  messageId: string;
  emoji: string;
  on: boolean;
}

export interface PinnedEvent extends BaseDeChat {
  tipo: 'chat.fijado';
  messageId: string;
  pinned: boolean;
  pinnedById: string | null;
}

export interface ReadEvent extends BaseDeChat {
  tipo: 'chat.leido';
  hasta: string;
}

/** Un aviso de la bandeja. El único que deja fila en `notifications`. */
export interface NoticeEvent {
  tipo: 'aviso';
  /** El `NotificationType` de la tabla. Aquí es texto: puede estrenar valores. */
  type: string;
  actorId: string | null;
  actorName?: string | null;
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  taskId: string | null;
  taskTitle: string | null;
  at: string;
}

/**
 * Alguien ha cambiado de presencia.
 *
 * ⚠️ **No es `BaseDeChat`**: no pertenece a ningún canal. Llega a quien comparte
 * algún proyecto con esa persona —la misma regla que decide con quién puedes
 * hablar— y no a toda la plataforma: quién está conectado en cada momento es
 * justo el dato que una herramienta de trabajo no debe regalar.
 *
 * `presencia` es **la efectiva**, ya cruzada por el servidor: si no hay conexión
 * abierta llega `AWAY` por mucho que la persona tenga «Ocupado» guardado. El
 * navegador no calcula nada.
 */
export interface PresenceEvent {
  tipo: 'presencia';
  userId: string;
  presencia: string;
  at: string;
  /**
   * Si el cambio es tuyo.
   *
   * Lo resuelve el servidor. Existe para que el selector de la barra lateral
   * pueda reaccionar a un cambio hecho **en otra pestaña** sin conocer tu id: le
   * llega solo el valor de tu presencia, no quién eres.
   */
  mio: boolean;
}

export type LiveEvent =
  | ChatMessageEvent
  | EditedEvent
  | DeletedEvent
  | ReactionEvent
  | PinnedEvent
  | ReadEvent
  | PresenceEvent
  | NoticeEvent;

/** Los `tipo` que existen, para el índice de suscriptores del despachador. */
export type EventType = LiveEvent['tipo'];

/** El evento concreto que corresponde a un `tipo`. */
export type EventOf<T extends EventType> = Extract<LiveEvent, { tipo: T }>;

/**
 * ¿Esto que ha llegado por el flujo es un evento que sabemos tratar?
 *
 * Se comprueba en el borde y no se confía en el tipo: lo que entra es JSON de la
 * red, y un `as LiveEvent` a secas es una promesa que TypeScript no puede
 * cumplir. Un evento de un servidor más nuevo que este navegador —un despliegue
 * a medias— se descarta aquí en vez de reventar el despachador.
 */
export function isKnownEvent(valor: unknown): valor is LiveEvent {
  if (typeof valor !== 'object' || valor === null) return false;
  const tipo = (valor as { tipo?: unknown }).tipo;
  return (
    tipo === 'aviso' ||
    tipo === 'chat.mensaje' ||
    tipo === 'chat.editado' ||
    tipo === 'chat.borrado' ||
    tipo === 'chat.reaccion' ||
    tipo === 'chat.fijado' ||
    tipo === 'chat.leido' ||
    tipo === 'presencia'
  );
}
