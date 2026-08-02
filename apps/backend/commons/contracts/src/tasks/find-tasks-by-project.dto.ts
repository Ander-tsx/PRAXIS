import { IsUUID } from 'class-validator';

/**
 * Trae todas las tareas de un proyecto sin paginar.
 * Pensado para consumidores analíticos (alexa-service), no para la UI.
 */
export class FindTasksByProjectDto {
  @IsUUID('4')
  projectId: string;
}
