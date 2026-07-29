import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * Borra las tareas que se quedan sin sitio al eliminar un proyecto, un espacio
 * o un tablero.
 *
 * Existe porque el borrado **no cruza entre microservicios**: `Board` vive en
 * projects-service y `Task` en tasks-service, sin clave foránea entre ellos, así
 * que al borrar un tablero sus tareas se quedaban en la base para siempre —
 * invisibles, imposibles de abrir (el guard no puede resolverles el proyecto) y
 * contando como pendientes en «mis tareas».
 *
 * Lo coordina el **gateway**, no projects-service: hacer que projects llamara a
 * tasks montaría un ciclo entre los dos, y el gateway ya habla con ambos.
 *
 * Es **idempotente**: volver a lanzarla sobre lo ya borrado no hace nada.
 */
export class PurgeTasksDto {
  /** Borra todas las tareas del proyecto. Para cuando se borra el proyecto. */
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  /**
   * Borra las tareas de estos tableros. Para un tablero suelto o para todos los
   * de un espacio, que el gateway resuelve **antes** de borrarlo.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  boardIds?: string[];
}
