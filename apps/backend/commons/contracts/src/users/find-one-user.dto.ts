import { IsNotEmpty, IsUUID } from 'class-validator';

export class FindOneUserDto {
    @IsUUID('4')
    @IsNotEmpty()
    id: string;
}
