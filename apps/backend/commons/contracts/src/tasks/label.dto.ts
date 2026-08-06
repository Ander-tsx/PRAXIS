import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Colores que puede tomar una etiqueta.
 *
 * Son **tokens del design system**, no hex libres: así las etiquetas siguen el
 * tema y ninguna se sale de la paleta. Con un hex abierto acabas con
 * veintitrés verdes distintos y ninguno es el del sistema.
 */
export const LABEL_COLORS = ['primary', 'accent', 'success', 'warning', 'error', 'info'] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

export class CreateLabelBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @ApiProperty({ enum: LABEL_COLORS })
  @IsIn(LABEL_COLORS as unknown as string[])
  color: string;
}

export class CreateLabelDto extends CreateLabelBodyDto {
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}

export class UpdateLabelBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional({ enum: LABEL_COLORS })
  @IsOptional()
  @IsIn(LABEL_COLORS as unknown as string[])
  color?: string;
}

export class UpdateLabelDto extends UpdateLabelBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}

export class FindLabelsDto {
  @IsUUID('4')
  projectId: string;
}

export class DeleteLabelDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}
