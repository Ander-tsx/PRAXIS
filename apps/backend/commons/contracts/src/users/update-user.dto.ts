import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateUserDto {
    @IsUUID()
    id: string;

    // TODO
    // @IsOptional()
    // @IsUUID()
    // roleId: string;

    // @IsOptional()
    // @IsString()
    // status?: string;

    @IsOptional()
    @IsString()
    first_name?: string;

    @IsOptional()
    @IsString()
    last_name?: string;
}
