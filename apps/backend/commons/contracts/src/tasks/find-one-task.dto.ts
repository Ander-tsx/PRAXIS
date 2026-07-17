import { IsUUID } from 'class-validator';

export class FindOneTaskDto {
  @IsUUID('4')
  id: string;
}
