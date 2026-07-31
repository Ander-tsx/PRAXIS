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
}

/** Payload al microservicio: el cuerpo más el dueño resuelto del token. */
export class CreateProjectDto extends CreateProjectBodyDto {
  @IsUUID()
  ownerId: string;
}
