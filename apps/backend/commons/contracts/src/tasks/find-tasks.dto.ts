import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { QueryOptionsDto } from '../pagination.dto';

export class FindTasksDto {
  @IsUUID('4')
  boardId: string;

  @IsOptional()
  @IsUUID('4')
  columnId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => QueryOptionsDto)
  query?: QueryOptionsDto;
}
