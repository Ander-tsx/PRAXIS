import { IsArray, IsInt, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateColumnDto {
  @IsUUID('4')
  boardId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsInt()
  order: number;
}

export class ReorderColumnsDto {
  @IsUUID('4')
  boardId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  columnIds: string[];
}

export class DeleteColumnDto {
  @IsUUID('4')
  id: string;
}
