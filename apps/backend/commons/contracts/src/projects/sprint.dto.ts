import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * PLANNED: creado, no arrancó. ACTIVE: en curso. CLOSED: terminado, de solo
 * lectura. Espejo del enum de Prisma en `projects-service` — la razón de
 * duplicarlo es la misma que `Priority` en `tasks`: el cliente no importa el
 * schema de un microservicio.
 */
export enum SprintStatus {
  PLANNED = 'PLANNED',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

/**
 * Código del 409 al cerrar un sprint con tareas sin resolver. Lleva la lista en
 * `details.pending` para que la interfaz pregunte por cada una (D6).
 */
export const SPRINT_HAS_PENDING_TASKS_CODE = 'SPRINT_HAS_PENDING_TASKS';

export class FindOneSprintDto {
  @IsUUID('4')
  id: string;
}

/** Para que el gateway componga: valida que un `sprintId` sea de un tablero. */
export class FindSprintsByIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class FindSprintsByBoardDto {
  @IsUUID('4')
  boardId: string;
}

/**
 * Cuerpo de `POST /boards/:boardId/sprints`.
 *
 * Nace `PLANNED` y sin fechas: crear un sprint es planearlo, no arrancar el
 * reloj. Las fechas se fijan al iniciarlo (`StartSprintBodyDto`).
 */
export class CreateSprintBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;
}

export class CreateSprintDto extends CreateSprintBodyDto {
  @IsUUID('4')
  boardId: string;
}

/** Cuerpo de `POST /boards/:boardId/sprints/:sprintId/start`. */
export class StartSprintBodyDto {
  @IsISO8601()
  startDate: string;

  @IsISO8601()
  endDate: string;
}

export class StartSprintDto extends StartSprintBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  boardId: string;
}

/**
 * Cuerpo de `PATCH /boards/:boardId/sprints/:sprintId`.
 *
 * De un sprint en curso solo se cambia el final; uno cerrado no se toca.
 */
export class UpdateSprintBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  /** Cadena vacía borra la meta. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

export class UpdateSprintDto extends UpdateSprintBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  boardId: string;
}

/**
 * Cuerpo de `POST /boards/:boardId/sprints/:sprintId/tasks`: mete un lote de
 * tareas **del backlog** en un sprint planeado o en curso. Lo usa encender
 * Scrum con «empezar con lo que ya está en columnas».
 */
export class AddTasksToSprintBodyDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  taskIds: string[];
}

/**
 * Qué hacer con una tarea pendiente al cerrar el sprint.
 *
 * Solo dos opciones, a propósito (D6 de `docs/PLAN-SCRUM-KANBAN.md`): nunca
 * hay un tercer camino "déjala donde está", porque "donde está" es un sprint
 * que va a quedar `CLOSED` y de solo lectura — quedarse ahí es perderla de
 * vista, no es neutral.
 */
export enum SprintCloseAction {
  BACKLOG = 'backlog',
  NEXT_SPRINT = 'nextSprint',
}

export class SprintTaskResolutionBodyDto {
  /**
   * `IsString` y no `IsUUID`: las tareas de las semillas tienen ids fijos que no
   * son UUID (`task0001-…`) y el resto de rutas de tarea los aceptan. No abre
   * nada: el gateway solo aplica resoluciones a ids que están en la lista de
   * pendientes del sprint, y la reasignación filtra por tablero y sprint.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  taskId: string;

  @IsEnum(SprintCloseAction)
  action: SprintCloseAction;
}

/**
 * Cuerpo de `POST /boards/:boardId/sprints/:sprintId/close`.
 *
 * `resolutions` tiene que cubrir **todas** las tareas del sprint sin
 * `completedAt` o el cierre se rechaza (409) devolviendo cuáles faltan — D6:
 * cerrar con pendientes siempre pregunta, nunca mueve en silencio.
 *
 * `nextSprintId` es obligatorio si alguna resolución pide `nextSprint`, y
 * tiene que ser un sprint `PLANNED` del mismo tablero: no se puede mandar
 * trabajo a un sprint que ya terminó o que todavía no existe.
 */
export class CloseSprintBodyDto {
  @ApiPropertyOptional({ type: [SprintTaskResolutionBodyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SprintTaskResolutionBodyDto)
  resolutions?: SprintTaskResolutionBodyDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  nextSprintId?: string;

  /**
   * Nombre del siguiente sprint si hay que crearlo. Nace **planeado, no en
   * marcha**: entre un sprint y otro va la planificación, y lo que entre en
   * ella tiene que contar como compromiso y no como añadido (auditoría S1).
   * Si ya hay un planeado, las tareas van a ese y esto se ignora.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nextName?: string;
}

export class CloseSprintDto extends CloseSprintBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  boardId: string;
}
