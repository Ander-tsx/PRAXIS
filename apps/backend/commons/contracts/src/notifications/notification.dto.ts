import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Tipos de aviso.
 *
 * Todos describen **algo que ya pasó**. Lo que espera una decisión —una
 * invitación sin responder— sigue viviendo en su propia tabla y se enseña
 * aparte: mezclar «te invitaron» con «acepta o rechaza» convierte una bandeja en
 * una lista de tareas a medias.
 *
 * No hay `TASK_EDITED` a propósito: emitirlo en cada `PATCH` llenaría la bandeja
 * de ruido —marcar un paso, cambiar una etiqueta— y el aviso útil se perdería
 * entre los demás.
 */
export enum NotificationType {
  INVITATION_RECEIVED = 'INVITATION_RECEIVED',
  INVITATION_ACCEPTED = 'INVITATION_ACCEPTED',
  INVITATION_REJECTED = 'INVITATION_REJECTED',
  MEMBER_LEFT = 'MEMBER_LEFT',
  MEMBER_REMOVED = 'MEMBER_REMOVED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  TASK_UNASSIGNED = 'TASK_UNASSIGNED',
  /**
   * ⚠️ **Un tipo por disparador de automatización.** Antes eran dos y se
   * elegían por el destinatario, no por lo ocurrido: con diez disparadores,
   * crear una tarea avisaba de que «lleva varios días sin movimiento». El
   * catálogo de `automation-service` empareja cada disparador con el suyo.
   */
  AUTOMATION_TASK_DUE_SOON = 'AUTOMATION_TASK_DUE_SOON',
  AUTOMATION_TASK_STALE = 'AUTOMATION_TASK_STALE',
  AUTOMATION_TASK_OVERDUE = 'AUTOMATION_TASK_OVERDUE',
  AUTOMATION_TASK_UNASSIGNED = 'AUTOMATION_TASK_UNASSIGNED',
  AUTOMATION_TASK_CREATED = 'AUTOMATION_TASK_CREATED',
  AUTOMATION_TASK_MOVED = 'AUTOMATION_TASK_MOVED',
  AUTOMATION_TASK_COMPLETED = 'AUTOMATION_TASK_COMPLETED',
  AUTOMATION_TASK_REOPENED = 'AUTOMATION_TASK_REOPENED',
  AUTOMATION_TASK_ASSIGNEES_CHANGED = 'AUTOMATION_TASK_ASSIGNEES_CHANGED',
  AUTOMATION_TASK_DUE_DATE_CHANGED = 'AUTOMATION_TASK_DUE_DATE_CHANGED',
}

/**
 * Un aviso a crear.
 *
 * `projectName` y `taskTitle` son **copias del momento**, no referencias: el
 * aviso tiene que seguir leyéndose cuando el proyecto o la tarea ya no existan.
 */
export class CreateNotificationDto {
  @IsUUID('4')
  userId: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  /** Quién lo provocó. Se descarta el aviso si coincide con `userId`. */
  @IsOptional()
  @IsUUID('4')
  actorId?: string;

  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @IsOptional()
  @IsUUID('4')
  taskId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  taskTitle?: string;
}

/**
 * Alta en bloque.
 *
 * Siempre en bloque, aunque sea uno: asignar una tarea a cuatro personas es un
 * solo evento y cuatro avisos, y mandarlos de uno en uno serían cuatro viajes
 * entre microservicios para el mismo hecho.
 */
export class CreateNotificationsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateNotificationDto)
  notifications: CreateNotificationDto[];
}

/** Query de `GET /api/me/notifications`. */
export class FindNotificationsQueryDto {
  /**
   * Página, desde 1.
   *
   * No existía: solo había `limit`, con tope 100, así que a partir del aviso
   * 101 no había forma de llegar. Una bandeja crece sola —cada asignación, cada
   * invitación, cada comentario— y es de las listas que más rápido se pasan de
   * cualquier tope.
   */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Solo las que faltan por leer. La campana las pide así. */
  @ApiPropertyOptional()
  @IsOptional()
  /* `Boolean('false')` es `true`: en una query todo llega como texto. */
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unreadOnly?: boolean;
}

export class FindNotificationsDto extends FindNotificationsQueryDto {
  @IsUUID('4')
  userId: string;
}

/** Marcar una como leída. El `userId` acota: solo las tuyas. */
export class MarkNotificationReadDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  userId: string;
}

export class MarkAllNotificationsReadDto {
  @IsUUID('4')
  userId: string;
}
