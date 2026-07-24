import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsUUID('4')
    @IsNotEmpty()
    authId: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    firstName: string;

    @IsOptional()
    @IsString()
    @MinLength(2)
    lastName: string;

    @IsOptional()
    @IsString()
    avatarUrl?: string;
}
