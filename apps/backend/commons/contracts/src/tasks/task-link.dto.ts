import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Un enlace adjunto a una tarea —un Google Doc, un Figma, un PR—. Vive en la
 * sección «Archivos» del panel junto a los PDF, pero no guarda bytes: solo la
 * URL y un título.
 */
export const TASK_LINK_URL_MAX = 2048;
export const TASK_LINK_TITLE_MAX = 200;
/** Tope técnico: un panel con más de esto deja de ser una lista que se lea. */
export const TASK_LINKS_MAX_PER_TASK = 50;

export class CreateTaskLinkBodyDto {
  @ApiProperty({ description: 'URL `http(s)`' })
  @IsString()
  @MaxLength(TASK_LINK_URL_MAX)
  /* Solo http(s): el enlace se pinta como `<a href>`, y un `javascript:` sería
     un script a un clic de cualquiera que abra la tarea. */
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'url tiene que ser un enlace que empiece por http:// o https://' },
  )
  url: string;

  @ApiPropertyOptional({ description: 'Título; sin él, la interfaz enseña el dominio' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TASK_LINK_TITLE_MAX)
  title?: string;
}

export class CreateTaskLinkDto extends CreateTaskLinkBodyDto {
  /* `IsString` y no `IsUUID`: hay tareas con ids que no son UUID (las del seed). */
  @IsString()
  taskId: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}

export class DeleteTaskLinkDto {
  @IsUUID('4')
  id: string;

  @IsString()
  taskId: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;

  /** Puede borrar enlaces ajenos: quien elimina tareas, como con los adjuntos. */
  @IsOptional()
  @IsBoolean()
  canModerate?: boolean;
}
