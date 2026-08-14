import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Qué se hizo. **Verbos concretos, no `STATUS_CHANGED` con un `metadata` que
 * haya que leer para saber qué pasó.**
 *
 * Un registro de auditoría se lee, se filtra y se cuenta por acción; con un solo
 * tipo genérico, «cuántas suspensiones hubo este mes» obliga a mirar dentro de
 * cada fila, y el desplegable de filtros del panel no tendría nada que ofrecer.
 *
 * ⚠️ **Solo-añadir.** No hay tipo para «se corrigió una entrada» porque no hay
 * forma de corregirla: el registro no tiene ruta de edición ni de borrado, ni
 * para un SuperAdmin. Si se pudiera reescribir, no sería auditoría.
 */
export enum AdminActionType {
  /** Se suspendió una cuenta: no puede entrar, y es reversible. */
  USER_SUSPENDED = 'USER_SUSPENDED',
  /** Se devolvió una cuenta a ACTIVE. */
  USER_REACTIVATED = 'USER_REACTIVATED',
  /** Se marcó una cuenta como INACTIVE (baja, no sanción). */
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  /** Se concedió un rol global. El rol va en `metadata.role`. */
  ROLE_GRANTED = 'ROLE_GRANTED',
  /** Se revocó un rol global. El rol va en `metadata.role`. */
  ROLE_REVOKED = 'ROLE_REVOKED',
  /** Se dejó un proyecto en solo lectura. */
  PROJECT_SUSPENDED = 'PROJECT_SUSPENDED',
  /** Se devolvió un proyecto a ACTIVE. */
  PROJECT_REACTIVATED = 'PROJECT_REACTIVATED',
  /**
   * Se retiró un proyecto de la vista de todos menos del administrador.
   *
   * No es el `DELETE` que ya existe: aquello cascadea y purga tareas en otro
   * microservicio, y es irreversible. Esto es un estado, y se deshace.
   */
  PROJECT_ARCHIVED = 'PROJECT_ARCHIVED',
  /** Se recuperó un proyecto archivado. */
  PROJECT_RESTORED = 'PROJECT_RESTORED',
  /**
   * Se cambió el plan del asistente de una cuenta. Va en `metadata.assistantPlan`.
   *
   * Tiene verbo propio y no se cuela en uno genérico porque **es lo que hace
   * las veces de una compra**: mientras no haya pasarela de pago, esta línea
   * del registro es la única prueba de quién concedió PRO a quién.
   */
  ASSISTANT_PLAN_CHANGED = 'ASSISTANT_PLAN_CHANGED',
}

/** Sobre qué clase de cosa se actuó. */
export enum AdminTargetType {
  USER = 'USER',
  PROJECT = 'PROJECT',
}

/**
 * Una entrada del registro, tal como se escribe.
 *
 * La escribe **el gateway y solo después de que la acción haya salido bien**:
 * anotar antes dejaría constancia de suspensiones que nunca ocurrieron, que en
 * un registro de auditoría es peor que no anotar nada.
 */
export class RecordAdminActionDto {
  /** Quién lo hizo. Sale del JWT, nunca del cuerpo de la petición. */
  @IsUUID()
  actorId: string;

  /**
   * Cómo se llamaba quien lo hizo, en ese momento.
   *
   * Copia, igual que `targetLabel`. Un registro que solo guarde ids obliga a
   * resolver cuatro servicios para poder leerse, y deja de poder leerse del todo
   * cuando la cuenta desaparece.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  actorLabel?: string;

  @IsEnum(AdminActionType)
  action: AdminActionType;

  @IsEnum(AdminTargetType)
  targetType: AdminTargetType;

  @IsUUID()
  targetId: string;

  /** Nombre o correo del objetivo **en el momento de la acción**. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  targetLabel?: string;

  /**
   * Por qué.
   *
   * Obligatorio al suspender —es lo que hace legible el aviso que ve el dueño de
   * un proyecto suspendido— y opcional al cambiar un rol. Quien decide eso es el
   * endpoint, no este DTO: aquí es opcional porque no todas las acciones lo
   * exigen.
   */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason?: string;

  /**
   * Lo que no cabe en las columnas: el rol concedido, el estado anterior.
   *
   * Deliberadamente sin forma fija. Lo que se filtra y se ordena son las
   * columnas; esto es para poder reconstruir el detalle al leer una entrada.
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/** Filtros del registro, ya plegados para el microservicio. */
export class FindAdminActivityDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsOptional()
  @IsEnum(AdminActionType)
  action?: AdminActionType;

  @IsOptional()
  @IsEnum(AdminTargetType)
  targetType?: AdminTargetType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

/**
 * Los mismos filtros **como query params** de `GET /admin/activity`.
 *
 * Existe por lo mismo que `FindUsersQueryDto`: `fetch` no puede mandar cuerpo en
 * un GET, y un DTO pensado para el payload TCP no sirve tal cual en la URL
 * porque las fechas llegan como cadena y los números también.
 *
 * Los cuatro ejes que pide el panel —quién, sobre quién, cuándo y qué— están
 * aquí. El «por qué» no se filtra: es texto libre y buscar dentro de él daría
 * una caja de búsqueda que promete más de lo que puede cumplir.
 */
export class FindAdminActivityQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Quién actuó' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Sobre quién o sobre qué se actuó' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ enum: AdminActionType })
  @IsOptional()
  @IsEnum(AdminActionType)
  action?: AdminActionType;

  @ApiPropertyOptional({ enum: AdminTargetType })
  @IsOptional()
  @IsEnum(AdminTargetType)
  targetType?: AdminTargetType;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  toFindAdminActivityDto(): FindAdminActivityDto {
    const dto: FindAdminActivityDto = {};
    if (this.page !== undefined) dto.page = this.page;
    if (this.limit !== undefined) dto.limit = this.limit;
    if (this.actorId !== undefined) dto.actorId = this.actorId;
    if (this.targetId !== undefined) dto.targetId = this.targetId;
    if (this.action !== undefined) dto.action = this.action;
    if (this.targetType !== undefined) dto.targetType = this.targetType;
    if (this.from !== undefined) dto.from = this.from;
    if (this.to !== undefined) dto.to = this.to;
    return dto;
  }
}
