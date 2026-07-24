import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { QueryOptionsDto } from '../pagination.dto';

export class FindTasksDto {
  @IsUUID('4')
  @IsNotEmpty()
  boardId: string;

  @IsOptional()
  @IsUUID('4')
  columnId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => QueryOptionsDto)
  query?: QueryOptionsDto;
}
