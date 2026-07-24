import { IsNotEmpty, IsUUID } from 'class-validator';

export class ToggleChecklistDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;

  @IsUUID('4')
  @IsNotEmpty()
  requesterId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;
}
