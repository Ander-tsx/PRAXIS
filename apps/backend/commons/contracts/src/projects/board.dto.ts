import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class FindOneBoardDto {
  @IsUUID('4')
  id: string;
}

/** Cuerpo de `POST /workspaces/:workspaceId/boards`. */
export class CreateBoardBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

export class CreateBoardDto extends CreateBoardBodyDto {
  @IsUUID('4')
  workspaceId: string;
}

/**
 * Cuerpo de `PATCH /boards/:boardId`.
 *
 * `scrumEnabled` se edita aquí y no en un endpoint propio: es una propiedad
 * del tablero, como su nombre, y ya exige `canEditBoard` — el mismo permiso
 * con el que se renombra un tablero. Ver `docs/PLAN-SCRUM-KANBAN.md`, D1.
 */
export class UpdateBoardBodyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  scrumEnabled?: boolean;
}

export class UpdateBoardDto extends UpdateBoardBodyDto {
  @IsUUID('4')
  id: string;
}

export class DeleteBoardDto {
  @IsUUID('4')
  id: string;
}
