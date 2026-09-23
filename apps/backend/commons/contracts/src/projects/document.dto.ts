import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Tope del contenido de un documento (D2 de `docs/PLAN-DOCUMENTOS.md`). */
export const DOCUMENT_CONTENT_MAX = 100_000;

/**
 * Código del 409 al guardar sobre una versión que ya no es la última: alguien
 * guardó entre que se abrió el documento y se pulsó guardar (D4).
 */
export const DOCUMENT_CHANGED_CODE = 'DOCUMENT_CHANGED';

/** Cuerpo de `POST /workspaces/:workspaceId/documents`. */
export class CreateDocumentBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(DOCUMENT_CONTENT_MAX)
  content?: string;
}

export class CreateDocumentDto extends CreateDocumentBodyDto {
  @IsUUID('4')
  workspaceId: string;

  @IsUUID('4')
  requesterId: string;
}

/**
 * Cuerpo de `PATCH /workspaces/:workspaceId/documents/:documentId`.
 *
 * `expectedUpdatedAt` es el `updatedAt` que tenía el documento al abrirlo. Si
 * ya no es el de la base, responde 409 `DOCUMENT_CHANGED` y no guarda (D4).
 */
export class UpdateDocumentBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(DOCUMENT_CONTENT_MAX)
  content?: string;

  @IsISO8601()
  expectedUpdatedAt: string;
}

export class UpdateDocumentDto extends UpdateDocumentBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  workspaceId: string;

  @IsUUID('4')
  requesterId: string;
}

export class DocumentRefDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  workspaceId: string;
}
