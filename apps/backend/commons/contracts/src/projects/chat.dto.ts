import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CHAT_ATTACHMENT_MAX_PER_MESSAGE } from './chat-attachment.dto';

/**
 * Tope de un mensaje del chat.
 *
 * El mismo que un comentario de tarea. No es una cifra elegida por el chat: que
 * los dos campos de texto largo del producto acepten lo mismo evita que el
 * límite dependa de en qué pantalla estás escribiendo.
 */
export const CHAT_MESSAGE_MAX = 4000;

/**
 * Las reacciones que se **ofrecen**, en el orden en que las pinta el cliente.
 *
 * Una lista corta y **cerrada**, no texto libre: el emoji viaja en el cuerpo y
 * acaba en la base, así que dejarlo abierto es un campo más donde meter lo que
 * sea. Espejo de `REACTIONS` en projects-service.
 */
export const CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '👎'] as const;

/**
 * Las que se **aceptan**: las de arriba más las que se retiraron del selector.
 *
 * ⚠️ **Validar solo contra `CHAT_REACTIONS` deja pegadas las reacciones
 * viejas.** `on: false` pasa por esta misma validación, así que al recortar la
 * lista un 🎉 ya guardado devolvía 400 al intentar quitarlo y no había forma
 * de retirarlo. Los retirados se aceptan **pero no se ofrecen**: ningún cliente
 * los pinta, así que se pueden quitar y no se pueden volver a poner. Cuando no
 * quede ninguno en la base, esta constante puede desaparecer.
 *
 * Espejo de `REACCIONES_ACEPTADAS` en projects-service.
 */
export const CHAT_REACTIONS_ACEPTADAS = [...CHAT_REACTIONS, '🎉', '👀', '🚀', '😄'] as const;

/**
 * Lo que manda el cliente al escribir.
 *
 * ⚠️ **No lleva `projectId` ni `peerId`.** Los resuelve la ruta, como en tareas,
 * checklists y comentarios. Mandarlos da 400.
 *
 * `body` es opcional **si** el mensaje lleva adjuntos: un mensaje puede ser
 * solo un archivo. `ValidateIf` en vez de `IsOptional` porque `body` sigue
 * siendo obligatorio cuando no hay adjuntos — los dos casos son reales y
 * confundirlos dejaría mensajes vacíos en la base.
 */
export class SendChatMessageBodyDto {
  @ValidateIf((o) => !(o.attachmentIds && o.attachmentIds.length > 0))
  @ApiProperty({ maxLength: CHAT_MESSAGE_MAX, required: false })
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_MESSAGE_MAX)
  body?: string;

  /**
   * A qué mensaje responde.
   *
   * El servidor comprueba que sea **de esta misma conversación**: sin eso, un id
   * conocido de otro chat se citaría aquí y su texto saldría en la cita.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  replyToId?: string;

  /**
   * Los adjuntos que ya se subieron como borradores y este mensaje reclama.
   *
   * ⚠️ **Los archivos se suben aparte** —`POST …/attachments`— y aquí solo van
   * los ids. El servidor comprueba que cada uno sea de esta conversación, de
   * quien escribe y que siga sin dueño; si alguno falla, el mensaje no se
   * crea y el adjunto se queda en borrador.
   */
  @ApiPropertyOptional({ maxItems: CHAT_ATTACHMENT_MAX_PER_MESSAGE })
  @IsOptional()
  @ArrayMaxSize(CHAT_ATTACHMENT_MAX_PER_MESSAGE)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];

  /**
   * Si este mensaje se escribe dentro del panel del hilo.
   *
   * Es lo que separa «responder» de «hilo» — los dos citan con `replyToId`,
   * pero solo este deja el mensaje fuera de la conversación general, visible
   * únicamente al abrir el hilo. Ausente o `false`: es un mensaje normal,
   * aunque cite a otro.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enHilo?: boolean;
}

/**
 * Lo que manda el cliente al editar un mensaje.
 *
 * ⚠️ **No lleva `projectId` ni `peerId`**, igual que el de escribir: los resuelve
 * la ruta. Mandarlos da 400.
 *
 * Solo cambia el texto: el autor y el momento original quedan intactos, y se
 * marca `editedAt` para que la marca «editado» no mienta.
 */
export class EditChatMessageBodyDto {
  @ApiProperty({ maxLength: CHAT_MESSAGE_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_MESSAGE_MAX)
  body: string;
}

/**
 * Query de la lista de mensajes.
 *
 * Se pagina **hacia atrás y con cursor**, no con `page`: un chat crece por
 * abajo, así que el número de página de un mensaje cambia cada vez que alguien
 * escribe y «la página 2» devolvería mensajes ya vistos y se saltaría otros.
 */
export class FindChatMessagesQueryDto {
  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Devuelve los anteriores a este mensaje. Para subir en el historial. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  before?: string;

  /**
   * Devuelve los **posteriores** a este mensaje. Para rellenar un hueco.
   *
   * `before` sube por el historial; esto baja por lo que se perdió. Existe para
   * el flujo en vivo: `EventSource` reconecta solo, pero **no reenvía lo
   * publicado mientras la conexión estuvo caída**. Al volver, el cliente pide
   * «lo que hay después del último mensaje que tengo» y rellena el hueco con una
   * sola petición, en lugar de recargar la conversación entera —que era lo que
   * hacía antes, y por eso cada hipo de red repintaba la pantalla.
   *
   * ⚠️ Es excluyente con `before`: pedir «lo anterior a X y lo posterior a Y» a
   * la vez no significa nada aquí. Si llegan los dos, manda `after`.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  after?: string;

  /**
   * `true`: solo los fijados, del más reciente al más antiguo. Para la lista de
   * anclados.
   *
   * ⚠️ Cuando va en `true`, `before` y `limit` se ignoran a propósito: la lista
   * de fijados es corta y se pinta entera, no paginada — una página con cursor
   * sobre algo que cabe en pantalla sería fricción sin beneficio.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pinned?: boolean;

  /**
   * Término de búsqueda sobre el texto del mensaje.
   *
   * Cuando viene, el endpoint deja de paginar el historial y devuelve los
   * mensajes que lo contienen —insensible a mayúsculas—, del más reciente al
   * más antiguo y hasta `limit`. Se ignoran `before` y `pinned` a propósito:
   * es una búsqueda, no una página del historial.
   */
  @ApiPropertyOptional({ maxLength: CHAT_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_MESSAGE_MAX)
  q?: string;
}

/** Silenciar o devolver el sonido. */
export class MuteChatBodyDto {
  @ApiProperty()
  @IsBoolean()
  muted: boolean;
}

/**
 * Poner o quitar una reacción.
 *
 * `on` en vez de dos rutas: el botón es un interruptor y quien lo pulsa ya sabe
 * en qué estado está. Con `POST`/`DELETE` separados, una pulsación rápida
 * mandaría la operación equivocada.
 */
export class ReactChatBodyDto {
  /* El `enum` de la documentación son las que se ofrecen; la validación acepta
     además las retiradas, para poder quitarlas. Ver `CHAT_REACTIONS_ACEPTADAS`. */
  @ApiProperty({ enum: CHAT_REACTIONS })
  @IsIn(CHAT_REACTIONS_ACEPTADAS as unknown as string[])
  emoji: string;

  @ApiProperty()
  @IsBoolean()
  on: boolean;
}

/**
 * Fijar o desfijar un mensaje.
 *
 * `on` en vez de dos rutas, igual que las reacciones: es un interruptor y quien
 * lo pulsa ya sabe en qué estado está.
 */
export class PinChatMessageBodyDto {
  @ApiProperty()
  @IsBoolean()
  on: boolean;
}
