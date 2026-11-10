import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AGENT_KINDS, type AgentKind } from '../mcp/agent-attribution';

/**
 * Cuerpo que envía el cliente.
 *
 * ⚠️ **No lleva `projectId`.** El gateway lo resuelve desde el `:taskId` de la
 * ruta, igual que en tareas y checklists.
 */
export class CreateCommentBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class CreateCommentDto extends CreateCommentBodyDto {
  @IsUUID('4')
  taskId: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;

  /** Lo pone el gateway desde el JWT del MCP; el cuerpo del cliente no lo trae. */
  @IsOptional()
  @IsIn(AGENT_KINDS)
  via?: AgentKind;
}

export class UpdateCommentBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class UpdateCommentDto extends UpdateCommentBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}

export class FindCommentsDto {
  @IsUUID('4')
  taskId: string;

  @IsUUID('4')
  projectId: string;
}

export class DeleteCommentDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;

  /**
   * Si quien borra puede eliminar tareas del proyecto.
   *
   * Lo resuelve el **gateway**, que ya consultó el permiso para dejar pasar la
   * petición: repetir la consulta aquí sería un salto de red por nada. Un
   * comentario lo borra su autor, o alguien con `canDeleteTask` haciendo
   * moderación.
   */
  canModerate: boolean;
}
