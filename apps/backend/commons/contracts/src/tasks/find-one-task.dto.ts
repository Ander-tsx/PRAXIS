import { IsNotEmpty, IsUUID } from 'class-validator';

export class FindOneTaskDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;
}
