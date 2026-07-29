import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Pone al día el `status` de las tareas de una columna que acaba de cambiar de
 * nombre.
 *
 * Existe porque **`Task.status` guarda el nombre de la columna, no su id**: el
 * estado está denormalizado a propósito (así el listado del tablero no tiene que
 * cruzar con projects-service), y el precio es que renombrar una columna deja el
 * `status` de todas sus tareas apuntando a un nombre que ya no existe. Sin esto,
 * «mis tareas» filtrado por `status` dejaba de encontrarlas y mover una tarea a
 * su propia columna la «arreglaba» sola, que es la clase de incoherencia que
 * nadie reproduce.
 *
 * Lo coordina el **gateway**, como `PurgeTasksDto` y por el mismo motivo: la
 * columna vive en projects-service y la tarea en tasks-service, y hacer que
 * projects llamara a tasks montaría un ciclo entre los dos.
 *
 * Es **idempotente**: solo toca las filas cuyo `status` no coincide ya.
 */
export class RestatusTasksDto {
  /** Columna renombrada. */
  @IsUUID('4')
  columnId: string;

  /** El nombre nuevo, que es el `status` que deben tener sus tareas. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  status: string;
}
