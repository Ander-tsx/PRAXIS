import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de `POST /projects`. El `ownerId` lo pone el gateway desde el token. */
export class CreateProjectBodyDto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar 100 caracteres' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La descripción no puede superar 500 caracteres' })
  description?: string;

  /**
   * De qué organización es.
   *
   * ⚠️ **Opcional en el cuerpo y obligatorio en la base.** Quien no lo mande cae
   * en su organización personal, que es lo correcto para quien solo tiene una:
   * el selector de la pantalla ni siquiera aparece si perteneces a una sola, y
   * obligar a mandarlo haría que la petición más común llevara un dato que la
   * persona no ha elegido.
   *
   * 🔴 **Quien lo resuelve es el gateway, no este servicio.** Es también quien
   * comprueba que perteneces a esa organización y que tienes `canCreateProject`
   * en ella: aceptarlo a ciegas dejaría meter un proyecto en la organización de
   * cualquiera con solo escribir su identificador.
   */
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

/** Payload al microservicio: el cuerpo más el dueño resuelto del token. */
export class CreateProjectDto extends CreateProjectBodyDto {
  @IsUUID()
  ownerId: string;

  /**
   * La organización, ya resuelta y comprobada por el gateway.
   *
   * A diferencia del cuerpo, aquí **no es opcional**: si llegara vacío el
   * proyecto se guardaría con una cadena vacía y no saldría en ningún listado,
   * sin que nada fallara.
   */
  @IsUUID()
  declare organizationId: string;
}

/**
 * A quién se le pasa la responsabilidad de un proyecto.
 *
 * ⚠️ **Tiene que ser ya miembro del proyecto.** Dárselo a alguien de fuera lo
 * dejaría con un responsable que ni siquiera lo ve.
 */
export class TransferProjectBodyDto {
  @IsUUID()
  userId: string;
}
