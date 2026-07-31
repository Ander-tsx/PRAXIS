import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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

/** Cuerpo de `PATCH /boards/:boardId`. */
export class UpdateBoardBodyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;
}

export class UpdateBoardDto extends UpdateBoardBodyDto {
  @IsUUID('4')
  id: string;
}

export class DeleteBoardDto {
  @IsUUID('4')
  id: string;
}
