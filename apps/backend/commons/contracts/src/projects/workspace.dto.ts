import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class FindOneWorkspaceDto {
  @IsUUID('4')
  id: string;
}

export class UpdateWorkspaceDto {
  @IsUUID('4')
  id: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;
}

export class DeleteWorkspaceDto {
  @IsUUID('4')
  id: string;
}
