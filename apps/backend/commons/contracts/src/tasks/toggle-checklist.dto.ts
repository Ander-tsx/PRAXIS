import { IsUUID } from 'class-validator';

/**
 * Cuerpo que envía el cliente: ninguno.
 *
 * ⚠️ **No lleva `projectId`.** Ver `DeleteTaskBodyDto`.
 */
export class ToggleChecklistBodyDto {}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class ToggleChecklistDto extends ToggleChecklistBodyDto {
  @IsUUID('4')
  id: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}
