import { IsOptional, IsUUID } from 'class-validator';

/**
 * Cuerpo que envía el cliente.
 *
 * ⚠️ **No lleva `projectId`.** Ver `DeleteTaskBodyDto`.
 */
export class AssignTaskBodyDto {
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class AssignTaskDto extends AssignTaskBodyDto {
  @IsUUID('4')
  id: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}
