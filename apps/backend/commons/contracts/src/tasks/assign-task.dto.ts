import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class AssignTaskDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;

  @IsUUID('4')
  @IsNotEmpty()
  requesterId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;
}
