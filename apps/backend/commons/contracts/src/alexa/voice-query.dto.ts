import { IsOptional, IsString, IsUUID } from 'class-validator';

/** Consulta sin proyecto: lista los proyectos visibles para el usuario de voz. */
export class VoiceProjectsQueryDto {
  @IsUUID()
  userId: string;
}

/** Consulta de analítica sobre un proyecto concreto. */
export class VoiceProjectQueryDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  projectId: string;
}

/** Consulta de desempeño de un integrante concreto. */
export class VoiceMemberQueryDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  projectId: string;

  @IsUUID()
  memberId: string;
}

/** Guarda el último proyecto usado para sugerirlo en la próxima sesión de voz. */
export class SetVoiceContextDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsString()
  alexaUserId?: string;
}
