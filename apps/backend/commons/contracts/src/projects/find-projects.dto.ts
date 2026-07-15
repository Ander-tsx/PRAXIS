import { IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryOptionsDto } from '../pagination.dto';

export class FindProjectsDto {
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;

  @IsOptional()
  @Type(() => QueryOptionsDto)
  query?: QueryOptionsDto;
}
