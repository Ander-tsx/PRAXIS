import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Planes del asistente y cuánto da cada uno **al mes**.
 *
 * Viven aquí y no en el servicio para que el contador del chat y el que
 * gobierna la cuota no puedan discrepar: un chat que dice «quedan 12» mientras
 * el backend rechaza el siguiente es peor que no enseñar contador.
 *
 * ⚠️ **No hay pasarela de pago.** Pasar a `PRO` es hoy un `UPDATE` a mano en
 * `assistant.assistant_subscriptions`. No inventes una pantalla de suscripción:
 * prometería algo que no existe.
 */
export const ASSISTANT_LIMITS = {
  FREE: 50,
  PRO: 500,
} as const;

export type AssistantPlanName = keyof typeof ASSISTANT_LIMITS;

/** Los cuatro papeles de un mensaje del hilo. */
export const ASSISTANT_ROLES = ['user', 'model'] as const;

/**
 * Un turno del hilo, tal y como lo reenvía el cliente.
 *
 * ⚠️ **El historial lo manda el cliente y el servidor no lo guarda.** Es la
 * consecuencia de no tener tabla de conversaciones —queda fuera del alcance a
 * propósito— y tiene un efecto que hay que tener presente: el hilo es *lo que
 * el cliente diga que es*. No importa para la seguridad, porque nada de lo que
 * el modelo devuelva se ejecuta sin que el usuario lo confirme y sin que el
 * gateway compruebe permisos; sí importa para el coste, y por eso se acota a
 * `MAX_HISTORIAL` turnos y a 2 000 caracteres cada uno.
 */
export class AssistantTurnDto {
  @ApiProperty({ enum: ASSISTANT_ROLES })
  @IsIn(ASSISTANT_ROLES as unknown as string[])
  role: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  text: string;
}

/** Cuántos turnos anteriores se aceptan. Ver la nota de `AssistantTurnDto`. */
export const MAX_HISTORIAL = 12;

export class AssistantChatBodyDto {
  @ApiProperty({ description: 'Lo que escribe el usuario' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({
    type: [AssistantTurnDto],
    description: 'Turnos anteriores del hilo. Los manda el cliente; el servidor no los guarda',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HISTORIAL)
  @ValidateNested({ each: true })
  @Type(() => AssistantTurnDto)
  history?: AssistantTurnDto[];
}

/**
 * Lo que el asistente **propone**, nunca lo que hace.
 *
 * Es la pieza central del diseño: cuando el modelo devuelve una llamada a
 * función, el backend **no la ejecuta**. Devuelve esto, el frontend pinta una
 * tarjeta de confirmación, y solo al pulsar «Aceptar» se llama a la Server
 * Action que ya usa el formulario del tablero — con los mismos permisos, la
 * misma validación y los mismos 400 y 403 que ya están probados.
 *
 * Un fallo del modelo es, como mucho, una propuesta mala que alguien rechaza.
 */
export interface AssistantProposal {
  /** `proponer_tarea` | `proponer_asignacion` */
  tool: string;
  /** Los argumentos tal cual los devolvió el modelo, ya validados contra el proyecto. */
  args: Record<string, unknown>;
}

/** Lo que ve el chat después de cada turno. */
export interface AssistantChatResult {
  reply: string;
  proposals: AssistantProposal[];
  cuota: AssistantQuota;
}

export interface AssistantQuota {
  plan: AssistantPlanName;
  usados: number;
  limite: number;
  /** `YYYY-MM`. El periodo que se está consumiendo. */
  periodo: string;
  /** ISO 8601 del día 1 del mes que viene: cuándo vuelve a cero. */
  reinicia: string;
}
