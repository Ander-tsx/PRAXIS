import { IsUUID } from 'class-validator';

export class FindOneUserDto {
  @IsUUID()
  id: string;
}
