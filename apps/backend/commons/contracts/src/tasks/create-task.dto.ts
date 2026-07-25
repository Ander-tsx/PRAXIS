import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from './priority.enum';

export class CreateTaskDto {
  /** ID del usuario que realiza la operación (inyectado por el gateway) */
  @IsUUID('4')
  requesterId: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  boardId: string;

  @IsUUID('4')
  columnId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  /** Estado inicial de la tarea; debe coincidir con el nombre de una columna del board */
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  /** Si se proporciona, esta tarea se crea como subtarea */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  parentTaskId?: string;
}
