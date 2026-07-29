import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
}
