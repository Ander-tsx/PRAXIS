import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum AutomationRuleStatus {
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
  PAUSED_SYSTEM = 'PAUSED_SYSTEM',
  INVALID = 'INVALID',
}

/**
 * Qué hace que una regla se plantee actuar.
 *
 * Hay **dos familias**, y la diferencia no es de implementación sino de lo que
 * significan para quien escribe la regla:
 *
 * - **De barrido**: describen un *estado* («vence pronto», «lleva parada»). No
 *   hay un instante en que ocurran, así que se evalúan cuando alguien pulsa
 *   «Revisar ahora». Preguntar «¿cuándo venció?» no tiene respuesta: venció y
 *   sigue vencida.
 * - **Reactivos**: describen un *hecho* («la han movido», «la han cerrado»).
 *   Ocurren en un instante concreto, llegan por el flujo de eventos de dominio
 *   y se atienden solos.
 *
 * El catálogo del servicio (`catalog.ts`) es quien sabe a cuál pertenece cada
 * uno y qué se puede filtrar en cada caso. Este enum solo pone los nombres.
 */
export enum AutomationTriggerType {
  GITHUB_PULL_REQUEST_OPENED = 'GITHUB_PULL_REQUEST_OPENED',
  // De barrido
  TASK_DUE_SOON = 'TASK_DUE_SOON',
  TASK_STALE = 'TASK_STALE',
  TASK_OVERDUE = 'TASK_OVERDUE',
  TASK_UNASSIGNED = 'TASK_UNASSIGNED',
  // Reactivos
  TASK_CREATED = 'TASK_CREATED',
  TASK_MOVED = 'TASK_MOVED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_REOPENED = 'TASK_REOPENED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  TASK_DUE_DATE_CHANGED = 'TASK_DUE_DATE_CHANGED',
}

export enum AutomationActionType {
  MOVE_TASK = 'MOVE_TASK',
  SEND_EMAIL = 'SEND_EMAIL',
  CREATE_NOTIFICATION = 'CREATE_NOTIFICATION',
  ASSIGN_TASK = 'ASSIGN_TASK',
  SET_PRIORITY = 'SET_PRIORITY',
  ADD_LABEL = 'ADD_LABEL',
  ADD_COMMENT = 'ADD_COMMENT',
  POST_CHAT_MESSAGE = 'POST_CHAT_MESSAGE',
}

export class AutomationTriggerDto {
  @ApiProperty({ enum: AutomationTriggerType, example: AutomationTriggerType.TASK_DUE_SOON })
  @IsEnum(AutomationTriggerType)
  type: AutomationTriggerType;

  @ApiProperty({ example: { leadTimeMinutes: 60 } })
  @IsObject()
  config: Record<string, unknown>;
}

export class AutomationConditionDto {
  @ApiProperty({ example: 'repositoryId' })
  @IsString()
  @MaxLength(80)
  field: string;

  @ApiProperty({ example: 'EQUALS' })
  @IsString()
  @MaxLength(40)
  operator: string;

  @ApiProperty({ example: '123456' })
  @IsDefined()
  value: unknown;
}

export class AutomationActionDto {
  @ApiProperty({ enum: AutomationActionType, example: AutomationActionType.MOVE_TASK })
  @IsEnum(AutomationActionType)
  type: AutomationActionType;

  @ApiProperty({ example: { targetColumnId: '00000000-0000-4000-8000-000000000001' } })
  @IsObject()
  config: Record<string, unknown>;
}

export class CreateAutomationRuleBodyDto {
  @ApiProperty({ example: 'Mover tarea al abrir pull request' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ type: AutomationTriggerDto })
  @ValidateNested()
  @Type(() => AutomationTriggerDto)
  trigger: AutomationTriggerDto;

  @ApiProperty({ type: [AutomationConditionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationConditionDto)
  conditions: AutomationConditionDto[];

  @ApiProperty({ type: [AutomationActionDto], maxItems: 5 })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AutomationActionDto)
  actions: AutomationActionDto[];

  @IsOptional()
  @IsEnum(AutomationRuleStatus)
  status?: AutomationRuleStatus;
}

export class CreateAutomationRuleDto extends CreateAutomationRuleBodyDto {
  @IsUUID('4')
  projectId: string;

  /** Inyectado por gateway desde JWT; nunca proviene del body HTTP. */
  @IsUUID('4')
  createdBy: string;
}

export class UpdateAutomationRuleBodyDto extends CreateAutomationRuleBodyDto {}

export class UpdateAutomationRuleDto extends UpdateAutomationRuleBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;
}

export class FindAutomationRuleDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;
}

export class PurgeAutomationProjectDto {
  @IsUUID('4')
  projectId: string;
}
