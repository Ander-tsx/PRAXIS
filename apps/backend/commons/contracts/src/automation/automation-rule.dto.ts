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

export enum AutomationTriggerType {
  GITHUB_PULL_REQUEST_OPENED = 'GITHUB_PULL_REQUEST_OPENED',
  TASK_DUE_SOON = 'TASK_DUE_SOON',
  TASK_STALE = 'TASK_STALE',
}

export enum AutomationActionType {
  MOVE_TASK = 'MOVE_TASK',
  SEND_EMAIL = 'SEND_EMAIL',
  CREATE_NOTIFICATION = 'CREATE_NOTIFICATION',
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
