import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, ValidateNested } from 'class-validator';
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

  /** El backlog del tablero: tareas con `sprintId: null` (D2). */
  @IsOptional()
  @IsBoolean()
  onlyBacklog?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => QueryOptionsDto)
  query?: QueryOptionsDto;
}
