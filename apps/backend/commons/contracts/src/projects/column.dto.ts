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
  'warning',
  'error',
  /* El verde va **el último** y significa algo: ver `DONE_COLUMN_COLOR`. */
  'success',
] as const;

export type ColumnColor = (typeof COLUMN_COLORS)[number];

/**
 * El verde marca la **columna de cierre**: las tareas que llegan ahí dejan de
 * contar como pendientes.
 *
 * Hacía falta alguna forma de saberlo. El `status` de una tarea es el nombre de
 * su columna, y ese nombre lo elige cada proyecto —«Hecho», «Finalizado»,
 * «Cerrado», «Done»—, así que nada permitía distinguir la columna que termina el
 * trabajo: una tarea acabada seguía saliendo como pendiente en el panel.
 *
 * ⚠️ **Es color y significado a la vez, y se eligió a sabiendas.** La
 * alternativa limpia es un campo aparte (`isFinal`) y dejar el color en
 * decoración; el coste de esto es que no se puede tener una columna verde que no
 * cierre, ni una columna de cierre de otro color. A cambio no hay estado oculto:
 * lo que la pantalla enseña es toda la regla. Cambiarlo más adelante es añadir
 * la columna a la tabla y mover esta constante a una consulta.
 */
export const DONE_COLUMN_COLOR: ColumnColor = 'success';

/**
 * Color por defecto de una columna nueva, repartido por posición.
 *
 * Replica lo que hacía la interfaz con su array `COLUMN_TINTS`, que asignaba
 * color **por índice** y por tanto lo cambiaba al reordenar. Aquí solo decide el
 * valor inicial: a partir de ahí el color es de la columna y viaja con ella.
 *
 * El reparto deja fuera el verde y el rojo: ver `COLUMN_ROTATION`.
 */
export function defaultColumnColor(order: number): ColumnColor {
  return COLUMN_ROTATION[Math.abs(Math.trunc(order)) % COLUMN_ROTATION.length];
}

/**
 * Colores que reparte `defaultColumnColor`.
 *
 * Ni verde ni rojo: el verde **cierra la tarea** y repartirlo por posición
 * marcaría como terminada la cuarta columna de cualquier tablero; el rojo se lee
 * como una alarma. Los dos se eligen a mano.
 */
const COLUMN_ROTATION = ['primary', 'accent', 'info', 'warning'] as const;

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

/**
 * Columnas por id, para que el gateway pueda componer.
 *
 * La usa `GET /me/tasks?excludeDone=true`: la tarea guarda `columnId` pero las
 * columnas viven en otro microservicio, así que sin esto no hay forma de saber
 * cuál de ellas es la de cierre.
 */
export class FindColumnsByIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class DeleteColumnDto {
  @IsUUID('4')
  id: string;
}
