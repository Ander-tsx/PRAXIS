import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, ValidateNested } from 'class-validator';
import { QueryOptionsDto } from '../pagination.dto';

class FindUsersFilter {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    createdFrom?: Date;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    createdTo?: Date;
}

export class FindUsersDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => QueryOptionsDto)
    query: QueryOptionsDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => FindUsersFilter)
    filters: FindUsersFilter;
}
