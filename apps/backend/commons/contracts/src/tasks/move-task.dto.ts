import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class MoveTaskDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;

  @IsUUID('4')
  @IsNotEmpty()
  requesterId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsUUID('4')
  @IsNotEmpty()
  columnId: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
