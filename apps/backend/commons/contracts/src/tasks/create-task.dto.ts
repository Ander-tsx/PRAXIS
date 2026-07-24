import {
    IsEnum,
    IsInt,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';
import { Priority } from './priority.enum';

export class CreateTaskDto {
  /** ID del usuario que realiza la operación (inyectado por el gateway) */
  @IsUUID('4')
  @IsNotEmpty()
  requesterId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsUUID('4')
  @IsNotEmpty()
  boardId: string;

  @IsUUID('4')
  @IsNotEmpty()
  columnId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Estado inicial de la tarea; debe coincidir con el nombre de una columna del board */
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  /** Si se proporciona, esta tarea se crea como subtarea */
  @IsOptional()
  @IsUUID('4')
  parentTaskId?: string;
}
