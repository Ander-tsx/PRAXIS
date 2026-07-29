import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

/** Cuerpo de `POST /boards/:boardId/columns`. */
export class CreateColumnBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(0)
  order: number;
}

export class CreateColumnDto extends CreateColumnBodyDto {
  @IsUUID('4')
  boardId: string;
}

/** Cuerpo de `PATCH /boards/:boardId/columns/reorder`. */
export class ReorderColumnsBodyDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  columnIds: string[];
}

export class ReorderColumnsDto extends ReorderColumnsBodyDto {
  @IsUUID('4')
  boardId: string;
}

export class DeleteColumnDto {
  @IsUUID('4')
  id: string;
}
