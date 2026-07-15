import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsUUID('4')
  projectId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
