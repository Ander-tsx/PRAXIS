import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Qué contiene un espacio: tableros o documentos, nunca las dos cosas
 * (`docs/PLAN-DOCUMENTOS.md`, D7).
 */
export const WORKSPACE_KINDS = ['BOARDS', 'DOCUMENTS'] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

/** Cuerpo de `POST /projects/:projectId/workspaces`. */
export class CreateWorkspaceBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  /** Sin él, de tableros: lo que eran todos los espacios hasta ahora. */
  @IsOptional()
  @IsIn(WORKSPACE_KINDS as unknown as string[])
  kind?: WorkspaceKind;
}

export class CreateWorkspaceDto extends CreateWorkspaceBodyDto {
  @IsUUID('4')
  projectId: string;
}
