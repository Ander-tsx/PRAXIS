import { IsUUID } from 'class-validator';

export class DeleteChecklistDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  requesterId: string;

  @IsUUID('4')
  projectId: string;
}
