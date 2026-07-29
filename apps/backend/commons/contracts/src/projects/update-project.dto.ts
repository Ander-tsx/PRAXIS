import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de `PATCH /projects/:id`. */
export class UpdateProjectBodyDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar 100 caracteres' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La descripción no puede superar 500 caracteres' })
  description?: string;
}

export class UpdateProjectDto extends UpdateProjectBodyDto {
  @IsUUID()
  id: string;
}
