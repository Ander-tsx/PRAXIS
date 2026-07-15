import { IsUUID } from 'class-validator';

export class GetUserProjectAccessDto {
  @IsUUID('4')
  userId: string;
}
