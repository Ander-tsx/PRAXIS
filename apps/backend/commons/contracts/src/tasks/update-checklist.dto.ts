import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Cuerpo que envía el cliente: el texto nuevo del paso.
 *
 * ⚠️ **No lleva `projectId`.** Ver `DeleteTaskBodyDto`. Marcar y desmarcar tiene su propia ruta
 * (`toggle`, `canMoveTask`); esta es **redefinir** el paso, y pide `canEditTask`.
 */
export class UpdateChecklistBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class UpdateChecklistDto extends UpdateChecklistBodyDto {
  @IsUUID('4')
  id: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}
