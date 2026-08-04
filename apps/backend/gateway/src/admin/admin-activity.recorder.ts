import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { RecordAdminActionDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

/**
 * Escribe en el registro de actividad, y hace ruido si no puede.
 *
 * ## Cuándo se llama
 *
 * **Siempre después de que la acción haya salido bien.** Anotar antes dejaría
 * constancia de suspensiones que nunca ocurrieron, y un registro con hechos
 * falsos es peor que uno incompleto: el incompleto se nota al leerlo, el falso
 * no.
 *
 * ## Qué pasa si la escritura falla
 *
 * Lo que **no** hace: `.catch(() => {})`. En un registro de auditoría perder una
 * entrada en silencio es el peor resultado posible, porque el registro sigue
 * pareciendo completo y ya no lo está.
 *
 * Lo que hace: registrar a nivel **error** el payload íntegro, de forma que la
 * entrada se pueda reconstruir a mano desde los logs. Y devolver `false`, para
 * que quien llama pueda decidir.
 *
 * ## Por qué no revienta la petición
 *
 * Se consideró responder 500. Se descartó: **la acción ya se aplicó**. Un 500
 * después de suspender a alguien le dice al administrador que no ha pasado nada,
 * y lo que hará es reintentar — con lo que la suspensión se aplica dos veces
 * (inocuo) o el cambio de rol devuelve un 409 desconcertante (no tanto). El
 * fallo se le cuenta a quien puede hacer algo con él, que es quien lee los logs,
 * y la respuesta dice la verdad sobre la acción.
 *
 * Quien llama recibe el booleano y puede añadir el aviso a la respuesta si en su
 * caso conviene.
 */
@Injectable()
export class AdminActivityRecorder {
  private readonly logger = new Logger(AdminActivityRecorder.name);

  constructor(
    @Inject('PERMISSIONS_SERVICE') private readonly permissionsClient: ClientProxy,
  ) {}

  /**
   * @returns `true` si quedó anotado. `false` si no, ya registrado como error.
   */
  async record(entrada: RecordAdminActionDto): Promise<boolean> {
    try {
      await firstValueFrom(
        this.permissionsClient.send({ cmd: 'admin_activity_record' }, entrada),
      );
      return true;
    } catch (error) {
      /* El payload completo y en una sola línea: es lo que permite reconstruir la
         entrada a mano. Sin él, el log diría que se perdió algo sin decir qué. */
      this.logger.error(
        `AUDITORÍA NO REGISTRADA — la acción se aplicó pero no se pudo anotar. ` +
          `Motivo: ${(error as Error).message}. Entrada: ${JSON.stringify(entrada)}`,
      );
      return false;
    }
  }
}
