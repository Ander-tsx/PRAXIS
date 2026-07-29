import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Cuerpo que envía el cliente.
 *
 * ⚠️ **No lleva `projectId`.** Ver `CreateTaskBodyDto`.
 */
export class CreateChecklistBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class CreateChecklistDto extends CreateChecklistBodyDto {
  @IsUUID('4')
  taskId: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}
