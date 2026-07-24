import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class FindOneBoardDto {
  @IsUUID('4')
  id: string;
}

export class CreateBoardDto {
  @IsUUID('4')
  workspaceId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

export class UpdateBoardDto {
  @IsUUID('4')
  id: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;
}

export class DeleteBoardDto {
  @IsUUID('4')
  id: string;
}
