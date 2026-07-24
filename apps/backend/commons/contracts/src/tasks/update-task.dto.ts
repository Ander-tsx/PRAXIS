import {
    IsEnum,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';
import { Priority } from './priority.enum';

export class UpdateTaskDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;

  @IsUUID('4')
  @IsNotEmpty()
  requesterId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID('4')
  columnId?: string;

  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
