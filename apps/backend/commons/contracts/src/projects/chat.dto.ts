import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
} from 'class-validator';

/**
 * Tope de un mensaje del chat.
 *
 * El mismo que un comentario de tarea. No es una cifra elegida por el chat: que
 * los dos campos de texto largo del producto acepten lo mismo evita que el
 * límite dependa de en qué pantalla estás escribiendo.
 */
export const CHAT_MESSAGE_MAX = 4000;

/**
 * Las reacciones que se aceptan.
 *
 * Una lista corta y **cerrada**, no texto libre: el emoji viaja en la URL y
 * acaba en la base, así que dejarlo abierto es un campo más donde meter lo que
 * sea. Espejo de `REACCIONES` en projects-service.
 */
export const CHAT_REACTIONS = ['👍', '🎉', '❤️', '👀', '🚀', '😄'] as const;

/**
 * Lo que manda el cliente al escribir.
 *
 * ⚠️ **No lleva `projectId` ni `peerId`.** Los resuelve la ruta, como en tareas,
 * checklists y comentarios. Mandarlos da 400.
 */
export class SendChatMessageBodyDto {
  @ApiProperty({ maxLength: CHAT_MESSAGE_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_MESSAGE_MAX)
  body: string;

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
  @ApiProperty({ enum: CHAT_REACTIONS })
  @IsIn(CHAT_REACTIONS as unknown as string[])
  emoji: string;

  @ApiProperty()
  @IsBoolean()
  on: boolean;
}
