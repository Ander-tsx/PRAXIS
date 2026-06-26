import { Type } from 'class-transformer';
import { IsDate, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { QueryOptionsDto } from '../pagination.dto';

class FindUsersFilter {
    @IsOptional()
    @IsString()
    search?: string;

    // TODO
    // @IsOptional()
    // @IsUUID()
    // roleId?: string;
    //
    //@IsOptional()
    //@IsString()
    //status?: string;

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
