import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/** Resuelve varios perfiles de usuario en una sola llamada. */
export class FindUsersByIdsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids: string[];
}
