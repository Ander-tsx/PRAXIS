import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Priority } from '../tasks/priority.enum';
import { REPORT_CROSS_DIMENSIONS, type ReportCrossDimension } from './report-bundle.dto';

/**
 * Los filtros de la sección de Análisis, definidos **una sola vez**.
 *
 * ## Por qué un DTO compartido y no un parámetro por ruta
 *
 * Son siete agregados y cada uno tenía su propia lista de parámetros —`days`
 * aquí, `weeks` allá, nada en los otros cinco—. Con los filtros metidos ruta a
 * ruta, la pantalla acabaría pudiendo filtrar el flujo acumulado por tablero
 * pero no la instantánea, sin que nada explicara la diferencia. Un filtro que
 * está en unos gráficos y no en otros no se lee como una limitación técnica: se
 * lee como que el gráfico que no filtra está mal.
 *
 * Así que la lista es una, la valida el mismo DTO en las ocho rutas, y llega
 * hasta el `WHERE` sin cambiar de forma: los cinco campos existen tal cual en el
 * esquema de tareas. Lo que cada informe puede hacer con ellos —y los tres que
 * no pueden hacer nada con `from`/`to`— está en `StatsService`.
 *
 * ## ⚠️ `from`/`to` y `days` no son lo mismo, y conviven
 *
 * `days` es «los últimos N días» y sigue siendo el caso normal: es lo que pide
 * un lienzo recién abierto, y no obliga a nadie a elegir dos fechas para ver
 * cómo va el mes. `from`/`to` es un tramo con principio y final, que es lo que
 * hace falta para mirar un sprint que ya terminó.
 *
 * **Si viene `from`, manda `from`.** No se suman ni se cruzan: un `days=30` con
 * un `from` de hace un año son dos respuestas distintas a la misma pregunta, y
 * la que quiere quien escribió las fechas es la suya. Se documenta aquí porque
 * es la clase de detalle que se descubre depurando un gráfico que sale vacío.
 *
 * ## ⚠️ Y el `days` de `blocked` **no es una ventana de historial**
 *
 * Allí significa «lleva sin moverse», que es la pregunta entera de ese informe.
 * Los filtros de aquí sí le aplican —qué tareas mira—, pero su `days` se queda
 * como está. Ya se documentó al agrupar los siete en una petición (R4.2) y se
 * repite porque es el mismo nombre para dos cosas.
 */
export class ReportFiltersQueryDto {
  /**
   * Principio del tramo, inclusive.
   *
   * Manda sobre `days` cuando viene. El gateway acota el tramo a 365 días por lo
   * mismo que acota `days`: sin techo, un `from` de 1970 convierte una consulta
   * barata en un recorrido del historial entero.
   */
  @ApiPropertyOptional({ description: 'ISO 8601. Manda sobre `days` si viene' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  /**
   * Final del tramo, inclusive.
   *
   * Sin `from` no hace nada: un «hasta» suelto es la ventana por defecto
   * terminando antes, que no es ninguna pregunta que nadie haga.
   */
  @ApiPropertyOptional({ description: 'ISO 8601. Solo cuenta acompañado de `from`' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Un tablero del proyecto.
   *
   * ⚠️ **No hace falta traducirlo a columnas.** Parece que sí —los tableros
   * viven en projects-service y aquí se agregan tareas— pero `Task` guarda
   * `boardId` además de `columnId`, y `TaskEvent` también. Así que el filtro
   * viaja tal cual hasta el `WHERE` y no cuesta ningún salto a projects-service.
   *
   * Se comprueba antes de tocar nada: pasar por columnas habría sido un cruce de
   * más en la ruta más pedida de la sección, y encima habría dejado fuera las
   * tareas de una columna borrada, que sí tienen tablero.
   */
  @ApiPropertyOptional({ description: 'Acota a las tareas de ese tablero' })
  @IsOptional()
  @IsUUID('4')
  boardId?: string;

  /** Solo las tareas de esa persona. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  /** Solo las tareas con esa etiqueta. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  labelId?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  /**
   * Solo las tareas que **hoy** están en ese sprint (P2.3 de
   * `docs/PLAN-SCRUM-KANBAN.md`).
   *
   * «Hoy», como el responsable: `task_events` no guarda en qué sprint estaba
   * una tarea cuando pasó cada cosa. Tras cerrar un sprint lo pendiente ya salió
   * de él (D6), así que filtrar un sprint cerrado enseña lo que se terminó ahí.
   */
  @ApiPropertyOptional({ description: 'Acota a las tareas de ese sprint' })
  @IsOptional()
  @IsUUID('4')
  sprintId?: string;
}

/**
 * Los mismos filtros como interfaz plana: es lo que viaja por TCP.
 *
 * No cambia de forma en ningún salto —gateway → reports → tasks— porque los
 * cinco campos existen tal cual en el esquema de tareas. Se declara aparte del
 * DTO por una razón sola: los servicios internos no dependen de
 * `class-validator`, y un tipo con decoradores obliga a arrastrarlo.
 */
export interface ReportFilters {
  /** Principio del tramo. Manda sobre la ventana en días. */
  from?: string;
  to?: string;
  boardId?: string;
  assigneeId?: string;
  labelId?: string;
  priority?: Priority;
  sprintId?: string;
}

/** Si no hay ningún filtro puesto, para poder saltarse trabajo. */
export function sinFiltros(filtros: ReportFilters | undefined): boolean {
  if (!filtros) return true;
  return (
    filtros.from === undefined &&
    filtros.to === undefined &&
    filtros.boardId === undefined &&
    filtros.assigneeId === undefined &&
    filtros.labelId === undefined &&
    filtros.priority === undefined &&
    filtros.sprintId === undefined
  );
}

/**
 * El trozo de clave de caché que corresponde a unos filtros.
 *
 * 🔴 **Sin esto, filtrar envenena la caché de quien no filtra.** Los informes se
 * guardan en Redis 60 s bajo `reports:<proyecto>:<informe>:<ventana>`, y esa
 * clave no sabía nada de filtros: quien mirara el flujo de un tablero concreto
 * dejaría su resultado guardado bajo la clave del proyecto entero, y el
 * siguiente en entrar —filtrando o no— vería el gráfico de otro. No da ningún
 * error: da un gráfico plausible y equivocado durante un minuto.
 *
 * Vive aquí y no en reports-service para que no haya dos: el día que se añada un
 * filtro, se añade al DTO y a esta función, que están en el mismo archivo y se
 * leen juntas. Un filtro nuevo que se olvide aquí es exactamente el fallo de
 * arriba.
 *
 * Devuelve cadena vacía cuando no hay filtros, para que la clave de siempre
 * siga siendo la de siempre y la caché no se parta en dos al desplegar esto.
 */
export function claveDeFiltros(filtros: ReportFilters | undefined): string {
  if (sinFiltros(filtros)) return '';
  const partes = [
    filtros?.from ?? '',
    filtros?.to ?? '',
    filtros?.boardId ?? '',
    filtros?.assigneeId ?? '',
    filtros?.labelId ?? '',
    filtros?.priority ?? '',
    /* El último, para que las claves sin sprint no cambien de forma más allá
       de un separador: la caché de antes se vuelve a llenar en un minuto. */
    filtros?.sprintId ?? '',
  ];
  return `:f${partes.join('|')}`;
}

/**
 * Los filtros más la ventana en días, para los cinco informes que la aceptan.
 *
 * ⚠️ **Existe porque el gateway valida con `forbidNonWhitelisted`**: un
 * parámetro que el DTO no declare no se ignora, responde 400. Así que las rutas
 * con `days` no pueden tipar la query con `ReportFiltersQueryDto` a secas — le
 * darían un 400 a `?days=30`, que es el parámetro que llevan desde el principio.
 */
export class ReportWindowQueryDto extends ReportFiltersQueryDto {
  /** Días de historial. El gateway lo acota a 1–365. Lo pisa `from` si viene. */
  @ApiPropertyOptional({ description: 'Días de historial (1–365)' })
  @IsOptional()
  days?: string;
}

/** Los filtros más las semanas de la serie. Solo lo usa `weekly`. */
export class ReportWeeklyQueryDto extends ReportFiltersQueryDto {
  @ApiPropertyOptional({ description: 'Semanas de la serie (2–52)' })
  @IsOptional()
  weeks?: string;
}

/**
 * Los filtros más las dos dimensiones del cruce. Solo lo usa `GET /reports/matrix`.
 *
 * ⚠️ Los dos son **obligatorios**: un cruce con una sola dimensión es cualquiera
 * de los gráficos que ya existen, y aceptarlo aquí habría duplicado el catálogo
 * con una ruta que responde peor.
 */
export class ReportMatrixQueryDto extends ReportFiltersQueryDto {
  @ApiProperty({ enum: REPORT_CROSS_DIMENSIONS })
  @IsIn(REPORT_CROSS_DIMENSIONS as unknown as string[])
  groupBy!: ReportCrossDimension;

  @ApiProperty({ enum: REPORT_CROSS_DIMENSIONS })
  @IsIn(REPORT_CROSS_DIMENSIONS as unknown as string[])
  splitBy!: ReportCrossDimension;
}
