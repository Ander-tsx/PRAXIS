import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

/**
 * Los tokens personales de acceso para el MCP (docs/PLAN-MCP.md, M3–M4).
 *
 * Un token es la llave que una persona le da a **su propio agente** para que
 * entre en Praxis como ella, dentro de una organización. No es PRAX: no aplica
 * «propone; nunca ejecuta» (ver «Qué NO es esto» en el plan).
 */

/**
 * Qué puede hacer el agente con un token.
 *
 * `write` incluye `read`; `delete` va aparte de `write` (M4): borrar es lo único
 * que no se deshace, y la pantalla lo pide marcar a conciencia.
 */
export const PAT_SCOPES = ['read', 'write', 'delete'] as const;
export type PatScope = (typeof PAT_SCOPES)[number];

/** Con qué empieza todo token. Sirve para reconocerlo en un registro o un `.env`. */
export const PAT_PREFIX = 'prx_';

/** Cuántos tokens vivos puede tener una persona (pregunta 3 de M0). */
export const PAT_MAX_PER_USER = 10;

/** Caducidad por defecto, en días (pregunta 2 de M0). `null` = sin caducidad. */
export const PAT_DEFAULT_EXPIRY_DAYS = 90;

/**
 * Llamadas por minuto que admite un token (M9).
 *
 * Además del límite por cuenta que ya aplica el gateway: un agente en bucle es
 * el caso típico, y la API la pagamos nosotros.
 */
export const PAT_CALLS_PER_MINUTE = 60;

/**
 * ¿Cubre este conjunto de alcances el que pide una herramienta?
 *
 * `write` implica `read`. `delete` no implica nada más ni lo implica nadie.
 */
export function scopeCovers(scopes: readonly string[], needed: PatScope): boolean {
  if (scopes.includes(needed)) return true;
  return needed === 'read' && scopes.includes('write');
}

/** Lo que se manda para crear un token. */
export class CreatePersonalTokenBodyDto {
  @ApiProperty({ example: 'Claude Desktop del portátil' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  /**
   * La organización en la que vale. Se valida la pertenencia en el gateway
   * (403 `NOT_IN_ORG`): el token **nunca** la toma de una cookie.
   */
  @ApiProperty()
  @IsUUID()
  organizationId: string;

  @ApiProperty({ enum: PAT_SCOPES, isArray: true, example: ['read'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PAT_SCOPES.length)
  @IsIn(PAT_SCOPES as unknown as string[], { each: true })
  scopes: PatScope[];

  /** Días hasta que caduca. Sin el campo, `PAT_DEFAULT_EXPIRY_DAYS`; `0`, nunca. */
  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  expiresInDays?: number;
}

/** Un token tal y como se lista. **Nunca** lleva el token ni su hash (I3). */
export interface PersonalTokenView {
  id: string;
  name: string;
  organizationId: string;
  prefix: string;
  scopes: PatScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Lo que devuelve crear: la vista y, **solo esta vez**, el token en claro. */
export interface CreatedPersonalToken {
  token: string;
  personalToken: PersonalTokenView;
}

/**
 * Lo que devuelve canjear un token por una llamada.
 *
 * `accessToken` es un JWT `typ: access` de vida corta con el `sub` del dueño:
 * con él el MCP llama a la API de siempre y ningún endpoint se entera (M5).
 */
export interface ExchangedPersonalToken {
  personalTokenId: string;
  userId: string;
  organizationId: string;
  scopes: PatScope[];
  accessToken: string;
}

/** Cuerpo de `PATCH /organizations/:organizationId/integrations` (M14). */
export class SetOrganizationIntegrationsBodyDto {
  /** Si los miembros pueden conectar su propio agente por MCP. */
  @ApiProperty()
  @IsBoolean()
  mcpAllowed: boolean;
}
