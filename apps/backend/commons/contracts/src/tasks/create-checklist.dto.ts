import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateChecklistDto {
  @IsUUID('4')
  taskId: string;

  @IsUUID('4')
  requesterId: string;

  @IsUUID('4')
  projectId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
