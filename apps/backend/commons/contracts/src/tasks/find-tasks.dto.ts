import { IsOptional, IsUUID } from 'class-validator';
import { QueryOptionsDto } from '../pagination.dto';

export class FindTasksDto {
  @IsUUID('4')
  boardId: string;

  @IsOptional()
  @IsUUID('4')
  columnId?: string;

  @IsOptional()
  query?: QueryOptionsDto;
}
