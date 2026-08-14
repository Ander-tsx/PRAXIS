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
import { ASSISTANT_PLANS, type AssistantPlanName } from '../assistant/assistant.dto';
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

/**
 * Cambia el plan del asistente de una cuenta.
 *
 * ⚠️ **No hay pasarela de pago y esto es lo que hace las veces.** Pasar a PRO es
 * una decisión administrativa, no una compra: por eso vive en el panel y exige
 * el rol global, en vez de estar en la pantalla de la persona.
 */
export class SetAssistantPlanBodyDto {
  @ApiProperty({ enum: ASSISTANT_PLANS })
  @IsIn(ASSISTANT_PLANS, { message: `plan debe ser uno de: ${ASSISTANT_PLANS.join(', ')}` })
  plan: AssistantPlanName;

  @ApiPropertyOptional({ description: 'Opcional. Se guarda en el registro.' })
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'El motivo debe tener al menos 4 caracteres' })
  @MaxLength(500)
  reason?: string;
}

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
