import { IsUUID } from 'class-validator';

export class GetUserRolesDto {
  /**
   * Sin versión, por lo que explica `AssignRoleDto`: los ids del seed no son v4.
   *
   * Aquí era una bomba de relojería y no un fallo visible: el
   * `ValidationPipe` de permissions-service valida también los payloads TCP, así
   * que **cualquier lectura de roles de una cuenta del seed** habría empezado a
   * fallar en cuanto alguien pasara este DTO por el pipe del gateway. Y de eso
   * depende hoy `GlobalRolesService`, que falla cerrado: el síntoma habría sido
   * un administrador al que de pronto se le niega todo.
   */
  @IsUUID()
  userId: string;
}
