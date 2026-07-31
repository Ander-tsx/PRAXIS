import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * Cuerpo que envía el cliente.
 *
 * ⚠️ **No lleva `projectId`.** Ver `CreateTaskBodyDto`.
 */
export class MoveTaskBodyDto {
  @IsUUID('4')
  columnId: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class MoveTaskDto extends MoveTaskBodyDto {
  @IsUUID('4')
  id: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;

  /**
   * ¿La columna destino es de **cierre** (la verde)?
   *
   * Lo resuelve el **gateway**, no el cliente y no este servicio: el color es un
   * campo de `BoardColumn`, que vive en projects-service, y tasks-service no
   * puede verlo. Es el mismo cruce que ya hacen `TaskPurgeService`,
   * `ColumnStatusSyncService` y el `excludeDone` de `/me/tasks`, y va en el
   * gateway por la misma razón: hacer que tasks llamara a projects encadenaría
   * dos saltos en una ruta que se llama al arrastrar cada tarjeta.
   *
   * Con esto tasks-service pone o limpia `Task.completedAt` y emite `COMPLETED`
   * o `REOPENED` sin conocer los colores.
   *
   * Si el gateway no lo pudo resolver llega `undefined`, y entonces **no se toca
   * `completedAt`**: es mejor no registrar un cierre que registrar uno falso.
   */
  @IsOptional()
  @IsBoolean()
  isClosingColumn?: boolean;
}
