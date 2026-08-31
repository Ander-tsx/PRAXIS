import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

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

  /**
   * Identidad visual, elegida en el modal de configuración del proyecto.
   *
   * `iconKey` es un nombre kebab-case de icono de `lucide-react` de la lista
   * curada del frontend; `color`, un `#rrggbb`. Ambos admiten `null` para volver
   * al monograma de letras. Se valida la forma, no que el icono exista.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: 'iconKey no tiene forma de nombre de icono' })
  iconKey?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color debe ser un hexadecimal #rrggbb' })
  color?: string | null;
}

export class UpdateProjectDto extends UpdateProjectBodyDto {
  @IsUUID()
  id: string;
}
