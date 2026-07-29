import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Logger } from '@praxis/observability';
import { firstValueFrom } from 'rxjs';

/**
 * Borra las tareas que se quedan sin sitio al eliminar un proyecto, un espacio
 * o un tablero.
 *
 * `Board` vive en projects-service y `Task` en tasks-service, sin clave foránea
 * entre ellos: el `ON DELETE CASCADE` de Postgres no cruza el límite. Sin esto,
 * borrar un tablero dejaba sus tareas en la base para siempre — invisibles,
 * imposibles de abrir (el guard no puede resolverles el proyecto porque el
 * tablero ya no existe) y contando como pendientes en «mis tareas».
 *
 * Vive en el **gateway** y no en projects-service porque hacer que projects
 * llamara a tasks montaría un ciclo entre los dos microservicios, mientras que
 * el gateway ya habla con ambos y es la capa que compone.
 *
 * ⚠️ **La limpieza va después del borrado, y es best-effort.** Si tasks-service
 * no responde, el recurso ya se borró y devolver un error diría que la
 * operación falló cuando sí ocurrió; se registra el fallo y se sigue. El
 * resultado en ese caso es el de siempre —tareas huérfanas—, y como
 * `task_purge` es idempotente, volver a lanzarla las limpia.
 */
@Injectable()
export class TaskPurgeService {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    private readonly logger: Logger,
  ) {}

  /** Tras borrar un proyecto: se van todas sus tareas. */
  async afterProjectDeleted(projectId: string) {
    await this.purge({ projectId }, `proyecto ${projectId}`);
  }

  /** Tras borrar un tablero o un espacio: se van las de esos tableros. */
  async afterBoardsDeleted(boardIds: string[]) {
    if (boardIds.length === 0) return;
    await this.purge({ boardIds }, `tableros ${boardIds.join(', ')}`);
  }

  private async purge(payload: { projectId?: string; boardIds?: string[] }, what: string) {
    try {
      const result = await firstValueFrom(
        this.tasksClient.send({ cmd: 'task_purge' }, payload),
      );
      if (result?.deleted > 0) {
        this.logger.log(`Limpieza de tareas: ${result.deleted} borradas al eliminar ${what}`);
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron limpiar las tareas de ${what}; quedan huérfanas. ${String(error)}`,
      );
    }
  }
}
