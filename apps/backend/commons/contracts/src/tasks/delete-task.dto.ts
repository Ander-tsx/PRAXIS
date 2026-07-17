import { IsUUID } from 'class-validator';

export class DeleteTaskDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  requesterId: string;

  @IsUUID('4')
  projectId: string;
}
