import { IsUUID } from 'class-validator';

export class ToggleChecklistDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  requesterId: string;

  @IsUUID('4')
  projectId: string;
}
