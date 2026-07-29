import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class FindOneWorkspaceDto {
  @IsUUID('4')
  id: string;
}

/** Cuerpo de `PATCH /workspaces/:workspaceId`. */
export class UpdateWorkspaceBodyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;
}

export class UpdateWorkspaceDto extends UpdateWorkspaceBodyDto {
  @IsUUID('4')
  id: string;
}

export class DeleteWorkspaceDto {
  @IsUUID('4')
  id: string;
}
