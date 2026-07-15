import { IsUUID } from 'class-validator';

export class CheckProjectAccessDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectId: string;
}
