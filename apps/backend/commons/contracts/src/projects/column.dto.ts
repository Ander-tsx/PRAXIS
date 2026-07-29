import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Colores que puede tomar una columna.
 *
 * Son **tokens del design system**, no hex libres, por el mismo motivo que en
 * las etiquetas (`LABEL_COLORS`): con un hex abierto acabas con veintitrés
 * verdes y ninguno es el del tema.
 */
export const COLUMN_COLORS = [
  'primary',
  'accent',
  'info',
  'success',
  'warning',
  'error',
] as const;

export type ColumnColor = (typeof COLUMN_COLORS)[number];

/**
 * Color por defecto de una columna nueva, repartido por posición.
 *
 * Replica lo que hacía la interfaz con su array `COLUMN_TINTS`, que asignaba
 * color **por índice** y por tanto lo cambiaba al reordenar. Aquí solo decide el
 * valor inicial: a partir de ahí el color es de la columna y viaja con ella.
 *
 * `error` queda fuera del reparto automático: un rojo por defecto se lee como
 * una alarma. Elegirlo a mano para un «Bloqueado» sí tiene sentido.
 */
export function defaultColumnColor(order: number): ColumnColor {
  const rotation = COLUMN_COLORS.slice(0, 5);
  return rotation[Math.abs(Math.trunc(order)) % rotation.length];
}

/** Cuerpo de `POST /boards/:boardId/columns`. */
export class CreateColumnBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(0)
  order: number;

  /** Si no viene, lo reparte `defaultColumnColor` según la posición. */
  @ApiPropertyOptional({ enum: COLUMN_COLORS })
  @IsOptional()
  @IsIn(COLUMN_COLORS as unknown as string[])
  color?: string;
}

export class CreateColumnDto extends CreateColumnBodyDto {
  @IsUUID('4')
  boardId: string;
}

/**
 * Cuerpo de `PATCH /boards/:boardId/columns/:id`.
 *
 * Los dos campos son opcionales, pero **al menos uno tiene que venir**: un
 * cuerpo vacío no describe ningún cambio y el servicio lo rechaza con 400.
 */
export class UpdateColumnBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: COLUMN_COLORS })
  @IsOptional()
  @IsIn(COLUMN_COLORS as unknown as string[])
  color?: string;
}

export class UpdateColumnDto extends UpdateColumnBodyDto {
  @IsUUID('4')
  id: string;
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
