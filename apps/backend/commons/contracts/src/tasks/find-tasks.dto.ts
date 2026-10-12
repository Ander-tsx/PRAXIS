import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { QueryOptionsDto } from '../pagination.dto';

export class FindTasksDto {
  @IsUUID('4')
  boardId: string;

  @IsOptional()
  @IsUUID('4')
  columnId?: string;

  /**
   * Tareas de un sprint concreto. Es lo que usa el Kanban de un tablero Scrum
   * para mostrar solo las del sprint activo (D12 de
   * `docs/PLAN-SCRUM-KANBAN.md`).
   *
   * No se combina con `onlyBacklog`: uno pide un sprint, el otro pide "sin
   * ninguno". El gateway nunca manda los dos a la vez.
   */
  @IsOptional()
  @IsUUID('4')
  sprintId?: string;

  /**
   * Tareas de **varios** sprints a la vez, y solo las terminadas (`completedAt` puesto): la
   * columna «Closed» de un tablero con Scrum. Las ids las resuelve el gateway —solo él sabe
   * cuáles sprints están cerrados— y salen ordenadas por cuándo se terminaron, la última arriba.
   * No se combina con `sprintId` ni con `onlyBacklog`.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  closedSprintIds?: string[];

  /** El backlog del tablero: tareas con `sprintId: null` (D2). */
  @IsOptional()
  @IsBoolean()
  onlyBacklog?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => QueryOptionsDto)
  query?: QueryOptionsDto;
}
