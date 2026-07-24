import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateColumnDto {
  @IsUUID('4')
  @IsNotEmpty()
  boardId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @Type(() => Number)
  @IsInt()
  order: number;
}

export class ReorderColumnsDto {
  @IsUUID('4')
  @IsNotEmpty()
  boardId: string;

  @IsArray()
  @IsUUID('4', { each: true })
  columnIds: string[];
}

export class DeleteColumnDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;
}
