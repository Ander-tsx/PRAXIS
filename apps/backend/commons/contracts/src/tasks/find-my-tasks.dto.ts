import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Priority } from './priority.enum';

/**
 * Query de `GET /api/me/tasks` — las tareas asignadas a quien pregunta.
 *
 * Cuelga de `/me` y no es `GET /tasks?assigneeId=…` a propósito: con el
 * `assigneeId` como parámetro, cualquiera consultaría las tareas de cualquiera,
 * y haría falta un permiso nuevo para cerrarlo. Derivándolo del token no hay
 * nada que cerrar.
 *
 * Siempre se acota a los proyectos donde la persona sigue estando: quitar a
 * alguien de un proyecto no borra sus filas de `TaskAssignee`, así que sin ese
 * filtro seguiría viendo tareas de un sitio del que ya salió.
 */
export class FindMyTasksQueryDto {
  /**
   * Solo tareas con fecha límite **anterior** a esta.
   *
   * El panel pide una semana vista y separa en cliente lo vencido de lo que
   * está por vencer: así saca los dos avisos con una sola petición. Las tareas
   * sin fecha nunca entran cuando este filtro viene.
   */
  @ApiPropertyOptional({ description: 'ISO 8601. Excluye las tareas sin fecha límite' })
  @IsOptional()
  @IsISO8601()
  dueBefore?: string;

  /** Nombre de la columna. Sirve para dejar fuera lo ya terminado. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  /** Acota a un proyecto concreto. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  /**
   * Deja fuera las tareas que ya están en una **columna de cierre**.
   *
   * Una columna de cierre es la que está pintada de verde (`DONE_COLUMN_COLOR`);
   * ver `COLUMN_COLORS` en `projects/column.dto`. Hace falta porque el `status`
   * de una tarea es el nombre de su columna, y ese nombre lo elige cada
   * proyecto: «Hecho», «Finalizado», «Cerrado», «Done»… No hay forma de saber
   * desde aquí cuál significa terminado, así que una tarea acabada seguía
   * contando como pendiente en el panel.
   *
   * Lo resuelve el **gateway**, no tasks-service: las columnas viven en
   * projects-service y hacer que tasks las pidiera encadenaría dos saltos, el
   * mismo motivo por el que `projectIds` también se resuelve arriba.
   */
  @ApiPropertyOptional({ description: 'Excluye las tareas en una columna verde (de cierre)' })
  @IsOptional()
  /* `Boolean('false')` es `true`, así que un `@Type(() => Boolean)` convertiría
     `?excludeDone=false` en un sí. En una query todo llega como texto. */
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  excludeDone?: boolean;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Payload al microservicio: la query + el usuario, que sale del token. */
export class FindMyTasksDto extends FindMyTasksQueryDto {
  @IsUUID('4')
  userId: string;

  /**
   * Proyectos donde el usuario sigue dentro, resueltos por el gateway.
   *
   * Los resuelve el gateway y no tasks-service para no encadenar dos saltos
   * (gateway → tasks → projects) en una ruta que el panel pide en cada carga.
   */
  @IsUUID('4', { each: true })
  projectIds: string[];
}
