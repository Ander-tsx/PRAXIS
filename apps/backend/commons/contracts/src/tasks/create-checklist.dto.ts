import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

/** Cuerpo que envía el cliente. El resto lo pone el gateway. */
export class CreateChecklistBodyDto {
  @IsUUID('4')
  projectId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

/** Payload al microservicio: el cuerpo + lo que inyecta el gateway. */
export class CreateChecklistDto extends CreateChecklistBodyDto {
  @IsUUID('4')
  taskId: string;

  @IsUUID('4')
  requesterId: string;
}
