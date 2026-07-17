import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class MoveTaskDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  requesterId: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  columnId: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
