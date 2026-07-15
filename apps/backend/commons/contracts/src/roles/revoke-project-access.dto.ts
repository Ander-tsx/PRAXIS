import { IsUUID } from 'class-validator';

export class RevokeProjectAccessDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectId: string;
}
