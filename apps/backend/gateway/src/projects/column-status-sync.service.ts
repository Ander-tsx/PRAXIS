import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Logger } from '@praxis/observability';
import { firstValueFrom } from 'rxjs';

/**
 * Pone al día el `status` de las tareas cuando su columna cambia de nombre.
 *
 * `Task.status` guarda el **nombre** de la columna, no su id: el estado está
 * denormalizado a propósito, para que el listado del tablero no tenga que cruzar
 * con projects-service. El precio es que renombrar una columna deja el `status`
 * de todas sus tareas apuntando a un nombre que ya no existe.
 *
 * Lo que se rompía sin esto:
 *  - `GET /me/tasks?status=` dejaba de encontrarlas, y es como el panel separa
 *    lo terminado de lo pendiente;
 *  - mover una tarea a su propia columna la «arreglaba» sola, así que el
 *    problema desaparecía justo al intentar reproducirlo.
 *
 * Vive en el **gateway** por lo mismo que `TaskPurgeService`: la columna está en
 * projects-service y la tarea en tasks-service, y hacer que projects llamara a
 * tasks montaría un ciclo entre los dos microservicios. El gateway ya habla con
 * ambos y es la capa que compone.
 *
 * ⚠️ **Va después del renombrado y es best-effort.** Si tasks-service no
 * responde, la columna ya se renombró y devolver un error diría que la operación
 * falló cuando sí ocurrió; se registra y se sigue. Como `task_restatus` es
 * idempotente, el siguiente renombrado —o volver a lanzarlo— lo cuadra.
 */
@Injectable()
export class ColumnStatusSyncService {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    private readonly logger: Logger,
  ) {}

  /** Tras renombrar una columna: sus tareas pasan a ese `status`. */
  async afterColumnRenamed(columnId: string, status: string) {
    try {
      const result = await firstValueFrom(
        this.tasksClient.send({ cmd: 'task_restatus' }, { columnId, status }),
      );
      if (result?.updated > 0) {
        this.logger.log(
          `Cascada de renombrado: ${result.updated} tareas pasan a «${status}» (columna ${columnId})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `No se pudo actualizar el status de las tareas de la columna ${columnId}; ` +
          `quedan apuntando al nombre anterior. ${String(error)}`,
      );
    }
  }
}
