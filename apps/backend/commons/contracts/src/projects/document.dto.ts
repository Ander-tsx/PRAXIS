import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Tope del contenido de un documento, en caracteres de Markdown. Subió de
 * 100 000 con el editor en bloques: una tabla o una lista larga ocupan más
 * Markdown que su texto (`docs/PLAN-DOCUMENTOS.md`, etapa 2).
 */
export const DOCUMENT_CONTENT_MAX = 500_000;

/** Imágenes de un documento: 5 MB y cuatro formatos (E6). SVG no: puede llevar script. */
export const DOCUMENT_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_ASSET_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

/**
 * ¿Empiezan estos bytes como dice el tipo? Un `.png` renombrado que es un
 * HTML no entra: el tipo lo declara el navegador y se comprueba aquí.
 */
export function esImagenDeVerdad(bytes: Uint8Array, mime: string): boolean {
  const empieza = (...firma: number[]) => firma.every((b, i) => bytes[i] === b);
  switch (mime) {
    case 'image/png':
      return empieza(0x89, 0x50, 0x4e, 0x47);
    case 'image/jpeg':
      return empieza(0xff, 0xd8, 0xff);
    case 'image/gif':
      return empieza(0x47, 0x49, 0x46, 0x38);
    case 'image/webp':
      return empieza(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45;
    default:
      return false;
  }
}

/** Quién entra por enlace (E8). Editar exige sesión (decisión 1). */
export enum DocumentLinkAccess {
  NONE = 'NONE',
  READ = 'READ',
  EDIT = 'EDIT',
}

export enum DocumentRole {
  READ = 'READ',
  EDIT = 'EDIT',
}

/**
 * `typ` del billete que abre el tiempo real (E3). Un billete **no** es un token
 * de sesión: `JwtGuard` rechaza cualquier `typ` que no sea `access`, así que
 * uno filtrado no abre la API.
 */
export const COLLAB_TICKET_TYP = 'collab';

/** Lo que lleva el billete del tiempo real. */
export interface CollabTicketClaims {
  typ: typeof COLLAB_TICKET_TYP;
  /** El documento: el billete no abre ningún otro. */
  doc: string;
  /** `null` para quien lee por enlace sin sesión. */
  sub: string | null;
  mode: 'read' | 'edit';
  name: string;
  color: string;
}

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
 * Cuerpo de `PATCH /workspaces/:workspaceId/documents/:documentId`: **solo el
 * título**. El contenido se escribe por el tiempo real (E4): un `PATCH` de
 * texto mientras otros tienen el documento abierto se perdería en el
 * siguiente guardado de Yjs. Mandar `content` da 400.
 */
export class UpdateDocumentBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

/** Cuerpo de `PATCH /documents/:id/share`. */
export class UpdateDocumentShareBodyDto {
  @ApiPropertyOptional({ enum: DocumentLinkAccess })
  @IsOptional()
  @IsEnum(DocumentLinkAccess)
  linkAccess?: DocumentLinkAccess;

  /** Un enlace nuevo: el anterior deja de abrir el documento. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  regenerateLink?: boolean;
}

/** Cuerpo de `POST /documents/:id/invites`. */
export class InviteToDocumentBodyDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsEnum(DocumentRole)
  role: DocumentRole;
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
