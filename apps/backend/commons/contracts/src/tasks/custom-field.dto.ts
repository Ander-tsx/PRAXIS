import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LABEL_COLORS } from './label.dto';

/**
 * Campos personalizados de un proyecto (`docs/PLAN-CAMPOS-PERSONALIZADOS.md`).
 *
 * Los define el proyecto —«Reviewer», «Cliente», «Versión»— y valen para todos
 * sus tableros, igual que las etiquetas. Gestionarlos exige `canEditTask` (D2
 * del plan): quien edita tareas decide qué se anota en ellas.
 */
export const CUSTOM_FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'DATE',
  'SELECT',
  'MULTI_SELECT',
  'PERSON',
  'CHECKBOX',
  'URL',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Los dos tipos que llevan una lista de opciones. */
export const CUSTOM_FIELD_TYPES_WITH_OPTIONS: readonly CustomFieldType[] = [
  'SELECT',
  'MULTI_SELECT',
];

/**
 * Tope **técnico**, no de plan (D3: los campos no se limitan por plan).
 *
 * Existe porque cada campo viaja con cada tarea del tablero y es una columna más
 * de la tabla: sin techo, un proyecto podría hacer que su propio tablero dejara
 * de cargar.
 */
export const CUSTOM_FIELDS_MAX_PER_PROJECT = 50;
export const CUSTOM_FIELD_OPTIONS_MAX = 50;
export const CUSTOM_FIELD_TEXT_MAX = 2000;
export const CUSTOM_FIELD_URL_MAX = 2048;

export class CustomFieldOptionDto {
  /**
   * Opcional al crear: el servidor asigna uno. Al editar, el de la opción que
   * ya existía —es lo que guardan las tareas—; una opción sin `id` es nueva.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  id?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @ApiProperty({ enum: LABEL_COLORS })
  @IsIn(LABEL_COLORS as unknown as string[])
  color: string;
}

export class CreateCustomFieldBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @ApiProperty({ enum: CUSTOM_FIELD_TYPES })
  @IsIn(CUSTOM_FIELD_TYPES as unknown as string[])
  type: string;

  @ApiPropertyOptional({ type: [CustomFieldOptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CUSTOM_FIELD_OPTIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => CustomFieldOptionDto)
  options?: CustomFieldOptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOnCard?: boolean;
}

export class CreateCustomFieldDto extends CreateCustomFieldBodyDto {
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}

/** Sin `type`: un campo no cambia de tipo (ver el enum en el schema). */
export class UpdateCustomFieldBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  /**
   * La lista **entera**. Una opción que desaparece se quita también de las
   * tareas que la tenían elegida.
   */
  @ApiPropertyOptional({ type: [CustomFieldOptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CUSTOM_FIELD_OPTIONS_MAX)
  @ValidateNested({ each: true })
  @Type(() => CustomFieldOptionDto)
  options?: CustomFieldOptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOnCard?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  order?: number;
}

export class UpdateCustomFieldDto extends UpdateCustomFieldBodyDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}

export class FindCustomFieldsDto {
  @IsUUID('4')
  projectId: string;
}

export class DeleteCustomFieldDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}

/**
 * El valor de un campo en una tarea.
 *
 * `value` es de forma libre a propósito —un texto, un número, una lista de
 * ids…—: lo que vale depende del **tipo del campo**, que el DTO no conoce. Lo
 * valida `CustomFieldsService.normalizeValue` contra ese tipo. `null` vacía el
 * campo.
 */
export class SetTaskFieldValueBodyDto {
  @ApiProperty({
    description:
      'Texto, número, fecha `yyyy-mm-dd`, booleano, id de opción o lista de ids según el tipo. `null` lo vacía.',
    nullable: true,
  })
  @Allow()
  value: unknown;
}

export class SetTaskFieldValueDto extends SetTaskFieldValueBodyDto {
  /* `IsString` y no `IsUUID`: hay tareas con ids que no son UUID (las del seed). */
  @IsString()
  taskId: string;

  @IsUUID('4')
  fieldId: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}
