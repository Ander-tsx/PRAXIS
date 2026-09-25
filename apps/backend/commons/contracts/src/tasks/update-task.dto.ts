import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Priority } from './priority.enum';

/**
 * Cuerpo que envía el cliente.
 *
 * ⚠️ **No lleva `projectId`.** Ver `CreateTaskBodyDto`.
 */
export class UpdateTaskBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  columnId?: string;

  /**
   * Conjunto completo de encargados. Omitirlo los deja como están; mandarlo
   * vacío desasigna a todo el mundo. Ver `AssignTaskBodyDto`.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  /** Conjunto completo de etiquetas. Omitirlo las deja como están. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  labelIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  /**
   * Mueve la tarea a un sprint (UUID) o al backlog (`null`). Omitirlo la deja
   * donde está. Es lo que usan "añadir al sprint" desde el Backlog y "devolver
   * al backlog" desde el tablero. Ver `docs/PLAN-SCRUM-KANBAN.md`, D2.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  sprintId?: string | null;

  /**
   * Puntos de estimación, sin escala impuesta (D4 de
   * `docs/PLAN-SCRUM-KANBAN.md`). `null` borra la estimación: sin estimar no
   * es lo mismo que cero.
   */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  estimatePoints?: number | null;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class UpdateTaskDto extends UpdateTaskBodyDto {
  @IsUUID('4')
  id: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;

  /**
   * ¿La columna destino es de cierre? Igual que en `MoveTaskDto`, y por el mismo
   * motivo: este `PATCH` **también** acepta `columnId`, así que también puede
   * cerrar una tarea. Si solo lo resolviera la ruta de mover, editar la columna
   * desde aquí dejaría el `completedAt` sin poner y el reporte se lo perdería.
   */
  @IsOptional()
  @IsBoolean()
  isClosingColumn?: boolean;
}
