import { IsUUID } from 'class-validator';

/** Proyectos donde el usuario es dueño o miembro. */
export class FindProjectsByMemberDto {
  @IsUUID('4')
  userId: string;
}
