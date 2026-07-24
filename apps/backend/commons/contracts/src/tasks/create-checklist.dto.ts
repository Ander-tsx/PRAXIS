import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateChecklistDto {
  @IsUUID('4')
  @IsNotEmpty()
  taskId: string;

  @IsUUID('4')
  @IsNotEmpty()
  requesterId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  text: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
