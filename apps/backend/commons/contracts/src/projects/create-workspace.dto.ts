import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de `POST /projects/:projectId/workspaces`. */
export class CreateWorkspaceBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

export class CreateWorkspaceDto extends CreateWorkspaceBodyDto {
  @IsUUID('4')
  projectId: string;
}
