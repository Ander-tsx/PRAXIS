import { IsUUID } from 'class-validator';

export class GrantProjectAccessDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectId: string;
}
