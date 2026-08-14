import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
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
/**
 * Peticiones al asistente por mes y plan.
 *
 * ⚠️ El gratuito da para probarlo, no para trabajar con él, y es deliberado:
 * cada pregunta cuesta una llamada a Gemini contra una clave nuestra, así que
 * una cuenta recién creada no puede vaciar la cuota de todos. Con 50 bastaba
 * una tarde para agotarla.
 *
 * PRO se asigna a mano desde el panel de administración —no hay pasarela de
 * pago— y es lo que se le da a quien tiene que usarlo de verdad.
 */
export const ASSISTANT_LIMITS = {
  FREE: 5,
  PRO: 250,
} as const;

export type AssistantPlanName = keyof typeof ASSISTANT_LIMITS;

/**
 * Los planes que existen, como lista.
 *
 * Sale de las claves de `ASSISTANT_LIMITS` y no se escribe aparte: son la misma
 * verdad, y dos listas a mano acaban discrepando el día que se añada un plan.
 * Lo usan el validador del panel y el desplegable que lo pinta.
 */
export const ASSISTANT_PLANS = Object.keys(ASSISTANT_LIMITS) as AssistantPlanName[];

/** Los cuatro papeles de un mensaje del hilo. */
export const ASSISTANT_ROLES = ['user', 'model'] as const;

/**
 * Un turno del hilo, tal y como lo reenvía el cliente.
 *
 * ⚠️ **Ya no se usa para nada.** Durante un tiempo el historial lo mandaba el
 * cliente en cada turno porque no había tabla de conversaciones, con el efecto
 * incómodo de que el hilo era *lo que el cliente dijera que era*. Desde
 * `assistant_conversations` sale de la base: el modelo ve exactamente el mismo
 * hilo que la pantalla, y el cliente ya no puede recortarlo mal.
 *
 * `MAX_HISTORIAL` sigue vivo y sigue significando lo mismo —cuántos turnos
 * entran en el prompt—, solo que ahora lo aplica el servidor al leer.
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
    description:
      'Conversación que se continúa. Sin él, el servidor abre una nueva y ' +
      'devuelve su id en la respuesta',
  })
  @IsOptional()
  @IsUUID('4')
  conversationId?: string;

  /**
   * @deprecated El servidor **guarda las conversaciones** desde que existe
   * `assistant_conversations`, así que el hilo sale de la base y este campo se
   * ignora. Se mantiene aceptado —y validado— para que un cliente sin
   * actualizar no reciba un 400, pero no influye en la respuesta.
   */
  @ApiPropertyOptional({
    type: [AssistantTurnDto],
    deprecated: true,
    description: 'Ignorado. El hilo lo guarda el servidor desde que hay conversaciones',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HISTORIAL)
  @ValidateNested({ each: true })
  @Type(() => AssistantTurnDto)
  history?: AssistantTurnDto[];
}

/** Renombrar una conversación. */
export class RenameConversationBodyDto {
  @ApiProperty({ minLength: 1, maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title: string;
}

/** Marcar una propuesta como aplicada o descartada. */
export class ResolveProposalBodyDto {
  @ApiProperty({ enum: ['ACCEPTED', 'DISCARDED'] })
  @IsIn(['ACCEPTED', 'DISCARDED'])
  status: 'ACCEPTED' | 'DISCARDED';
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
  /**
   * Id de la propuesta guardada.
   *
   * Existe desde que las conversaciones se persisten: es con lo que el cliente
   * marca la propuesta como aceptada o descartada, para que al releer el hilo
   * días después no vuelva a ofrecer un botón que ya se pulsó.
   */
  id?: string;
  /** `proponer_tarea` | `proponer_asignacion` | `proponer_edicion` | … */
  tool: string;
  /** Los argumentos tal cual los devolvió el modelo, ya validados contra el proyecto. */
  args: Record<string, unknown>;
  /** `PENDING` al proponerse. Solo las pendientes conservan sus botones al releer. */
  status?: AssistantProposalStatus;
}

export type AssistantProposalStatus = 'PENDING' | 'ACCEPTED' | 'DISCARDED';

/** Lo que ve el chat después de cada turno. */
export interface AssistantChatResult {
  /**
   * La conversación en la que ha caído este turno.
   *
   * Si la petición no traía `conversationId`, el servidor abrió una y este es su
   * id: el cliente tiene que quedárselo para que el siguiente mensaje continúe
   * el mismo hilo en vez de abrir otro.
   */
  conversationId: string;
  reply: string;
  proposals: AssistantProposal[];
  cuota: AssistantQuota;
}

/** Una conversación en la lista, sin sus mensajes. */
export interface AssistantConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mensajes: number;
}

/** Un turno guardado, tal y como se relee. */
export interface AssistantStoredMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
  proposals: AssistantProposal[];
}

/**
 * Una conversación entera.
 *
 * No extiende a `AssistantConversationSummary` porque `mensajes` significa
 * cosas distintas en cada una: en la lista es cuántos hay, aquí son cuáles.
 */
export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mensajes: AssistantStoredMessage[];
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
