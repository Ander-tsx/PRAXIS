import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Cuerpo que envía el cliente.
 *
 * ⚠️ **No lleva `projectId`.** Ver `DeleteTaskBodyDto`.
 */
export class AssignTaskBodyDto {
  /**
   * Conjunto **completo** de encargados: sustituye a los que hubiera.
   *
   * No es «añadir» ni «quitar», sino «esta es la lista». Es lo que hace un
   * selector múltiple al cerrarse, y así la operación es idempotente: repetirla
   * no duplica ni acumula. Un array vacío desasigna a todo el mundo.
   */
  @ApiProperty({ type: [String], description: 'Lista completa de encargados; sustituye la anterior' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  assigneeIds: string[];
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class AssignTaskDto extends AssignTaskBodyDto {
  @IsUUID('4')
  id: string;

  /** Resuelto por el guard desde la ruta, no por el cliente. */
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;
}
