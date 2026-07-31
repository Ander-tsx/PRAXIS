import { IsUUID } from 'class-validator';

/**
 * Cuerpo que envía el cliente: ninguno.
 *
 * ⚠️ **No lleva `projectId`.** El gateway lo resuelve desde la ruta y mandarlo
 * responde 400. Cuando lo elegía el cliente, declarar el id de un proyecto
 * propio daba acceso a las tareas de cualquier otro
 * (`PENDIENTES-BACKEND.md §9`).
 */
export class DeleteTaskBodyDto {}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class DeleteTaskDto extends DeleteTaskBodyDto {
  @IsUUID('4')
  id: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}
