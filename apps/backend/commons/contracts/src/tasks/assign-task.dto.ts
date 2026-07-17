import { IsOptional, IsUUID } from 'class-validator';

export class AssignTaskDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  requesterId: string;

  @IsUUID('4')
  projectId: string;

  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;
}
