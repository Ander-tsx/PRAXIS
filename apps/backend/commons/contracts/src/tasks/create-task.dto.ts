import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Priority } from './priority.enum';

/**
 * Cuerpo que envía el cliente.
 *
 * ⚠️ **No lleva `projectId`.** El gateway lo resuelve desde la ruta —aquí,
 * desde el `:boardId`— y mandarlo responde 400. Cuando lo elegía el cliente,
 * declarar el id de un proyecto propio daba acceso a las tareas de cualquier
 * otro (`PENDIENTES-BACKEND.md §9`).
 */
export class CreateTaskBodyDto {
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

  /** Encargados iniciales. Deben ser miembros del proyecto. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

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

  /** Etiquetas iniciales. Deben existir en el proyecto. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  labelIds?: string[];

  /** Si se proporciona, esta tarea se crea como subtarea */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  parentTaskId?: string;

  /**
   * A qué sprint entra. Lo decide el cliente, y las dos respuestas válidas
   * significan cosas distintas:
   *
   * - **Ausente** (la clave no viaja en el cuerpo): el gateway decide — si el
   *   tablero tiene Scrum encendido y hay un sprint activo, la ata a ese
   *   sprint; si no, queda en `null`. Es lo que manda "Añadir tarea" desde una
   *   columna del Kanban.
   * - **`null` explícito**: queda en el backlog del tablero, sin importar si
   *   hay un sprint activo. Es lo que manda "Añadir tarea" desde el Backlog.
   *
   * Ver `docs/PLAN-SCRUM-KANBAN.md`, D12.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  sprintId?: string | null;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class CreateTaskDto extends CreateTaskBodyDto {
  /** ID del usuario que realiza la operación (inyectado por el gateway) */
  @IsUUID('4')
  requesterId: string;

  @IsUUID('4')
  boardId: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;
}
