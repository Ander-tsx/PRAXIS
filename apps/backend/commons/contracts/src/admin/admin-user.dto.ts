import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GLOBAL_ROLES, type GlobalRole } from '../roles/global-role';

/**
 * Estado de una cuenta. Espejo del enum `UserStatus` de credentials-service.
 *
 * `SUSPENDED` es una sanción y `INACTIVE` una baja; el login rechaza los dos
 * igual (`auth.service.ts`), y la distinción existe para el registro de
 * actividad y para no llamar sanción a lo que no lo es.
 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Cuerpo de `PATCH /admin/users/:id/status`.
 *
 * ## Por qué no es un campo de `PATCH /users/:id`
 *
 * Porque esa ruta lleva `AccountOwnerGuard`, que **deja pasar al dueño de la
 * cuenta**: cualquier campo que se le añada queda automáticamente auto-editable.
 * Con `status` ahí, quien acabara de ser suspendido podría reactivarse a sí mismo
 * durante los minutos en que su access token sigue siendo válido, y la función
 * entera se anularía.
 *
 * ## El motivo es obligatorio para suspender
 *
 * No para reactivar. Suspender sin decir por qué produce una cuenta bloqueada
 * que nadie sabe explicar, ni la persona afectada ni el siguiente administrador
 * que mire el registro. Reactivar no necesita justificación: deshace.
 *
 * La regla no cabe en un decorador —depende del valor de otro campo— así que la
 * aplica el endpoint y este DTO solo declara la forma.
 */
export class SetUserStatusBodyDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus, {
    message: `status debe ser uno de: ${Object.values(UserStatus).join(', ')}`,
  })
  status: UserStatus;

  @ApiPropertyOptional({
    description: 'Obligatorio al suspender o desactivar. Se guarda en el registro.',
    minLength: 4,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'El motivo debe tener al menos 4 caracteres' })
  @MaxLength(500, { message: 'El motivo no puede superar 500 caracteres' })
  reason?: string;
}

/** Payload al microservicio: el cuerpo más el id de la ruta, y el id al final. */
export class SetUserStatusDto {
  @IsUUID()
  id: string;

  @IsEnum(UserStatus)
  status: UserStatus;
}

/**
 * Cuerpo de `PUT /admin/users/:id/role`.
 *
 * `PUT` y no `PATCH` porque **fija** el rol global: reemplaza los que hubiera en
 * vez de añadir uno. El nivel efectivo de una cuenta es el más alto de sus
 * filas, así que «añadir User» a un Admin no lo degradaría — y el panel enseña un
 * rol, no una lista. Con `PUT` lo que se ve y lo que se guarda son la misma cosa.
 */
export class SetUserRoleBodyDto {
  @ApiProperty({ enum: Object.values(GLOBAL_ROLES) })
  @IsIn(Object.values(GLOBAL_ROLES), {
    message: `role debe ser uno de: ${Object.values(GLOBAL_ROLES).join(', ')}`,
  })
  role: GlobalRole;

  @ApiPropertyOptional({ description: 'Opcional. Se guarda en el registro.' })
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'El motivo debe tener al menos 4 caracteres' })
  @MaxLength(500)
  reason?: string;
}

/*
 * 🕳️ Aquí estaba `SetAssistantPlanBodyDto`, el cuerpo de
 * `POST /admin/users/:id/assistant-plan`.
 *
 * Concedía a mano el `PRO` **por persona** del asistente, con la coletilla de
 * que «no hay pasarela de pago». La hay desde hace tiempo, y el tope de IA lo
 * decide el plan de la **organización** desde la etapa Enterprise: lo que
 * concedía esta ruta no cambiaba ningún límite, solo la etiqueta que la pantalla
 * enseñaba — que además podía contradecir al tope real.
 *
 * Retirado el 2026-09-03 con el resto del sistema. Ver
 * `docs/AUDITORIA-PLANES.md` (P5-P7).
 */

/** Fija el rol global de un usuario, reemplazando los que tuviera. */
export class SetUserRoleDto {
  @IsUUID()
  userId: string;

  @IsIn(Object.values(GLOBAL_ROLES))
  roleName: GlobalRole;
}

/** Resuelve los roles globales de varias cuentas de una vez. */
export class GetRolesForUsersDto {
  @IsUUID(undefined, { each: true })
  userIds: string[];
}

/**
 * Filtros de `GET /admin/users`.
 *
 * Es el listado del panel, y no `GET /users`: aquel es el **directorio** que usa
 * cualquiera para invitar gente a un proyecto, y ahí el estado de la cuenta y el
 * rol global no se enseñan. Este los enseña, y por eso está detrás de
 * `@RequireGlobalRole`.
 */
export class FindAdminUsersQueryDto {
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

  @ApiPropertyOptional({ description: 'Busca por nombre, apellido o email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserStatus, description: 'Filtra por estado de la cuenta' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
