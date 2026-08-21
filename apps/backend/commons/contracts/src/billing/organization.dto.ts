import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
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
import { PlanTier } from './plans';

/**
 * La organización: **la unidad que paga**.
 *
 * ## Por qué hace falta una unidad nueva
 *
 * Porque hoy la única unidad de pertenencia es el **proyecto**, con sus roles, y
 * colgar la suscripción de ahí haría que cada proyecto tuviera la suya: una
 * empresa con doce tableros pagaría doce veces y no habría dónde enseñar «tu
 * plan». Es la trampa 1 del encargo y está dicha allí con estas palabras: *una
 * organización no es un proyecto*.
 *
 * ## Y por qué también la tiene quien está solo
 *
 * ⚠️ **Todo el mundo tiene organización, incluida la cuenta que se registró
 * ayer y no ha invitado a nadie.** La alternativa —«o tienes plan individual o
 * perteneces a una organización»— obliga a que cada sitio que resuelve una
 * cuota pregunte primero cuál de los dos casos es, y a que la mitad de las
 * consultas tengan dos caminos. Con una organización de una persona, la
 * pregunta es siempre la misma: *¿cuál es el plan de tu organización?*
 *
 * La personal **no se ve en ninguna pantalla**: no tiene nombre, no admite
 * miembros y no aparece en ningún selector. Existe para que el modelo tenga una
 * sola forma. Se crea sola la primera vez que hace falta —no al registrarse—
 * por lo mismo que `AssistantSubscription` no creaba fila: rellenar una tabla
 * para todo el mundo antes de que sirva de algo es una migración disfrazada.
 */
export enum OrganizationKind {
  /** La de una persona. Invisible, un miembro, no admite más. */
  PERSONAL = 'PERSONAL',
  /** La que se contrata con nombre, asientos y quien la administre. */
  ENTERPRISE = 'ENTERPRISE',
}

/**
 * Los tres papeles dentro de una organización.
 *
 * ⚠️ **No tienen nada que ver con los roles de proyecto ni con el rol global.**
 * Ser `OWNER` de la organización no da ni un permiso dentro de un tablero: son
 * las dos primeras capas y esta es la tercera. Un `OWNER` que no sea miembro de
 * un proyecto de su propia organización **no lo ve**, y es a propósito — el plan
 * paga la plataforma, no abre las puertas de dentro.
 */
export enum OrganizationRole {
  /** Quien la creó. Paga, y es el único que puede disolverla. */
  OWNER = 'OWNER',
  /** Puede invitar, quitar y ver el consumo. No puede tocar la suscripción. */
  ADMIN = 'ADMIN',
  /** Consume el plan y ve cuánto le queda. Nada más. */
  MEMBER = 'MEMBER',
}

export const ORGANIZATION_ROLES = Object.values(OrganizationRole);

/**
 * En qué estado está alguien dentro de la organización.
 *
 * ⚠️ **Una invitación ocupa asiento.** Si no lo ocupara, se podrían mandar mil
 * invitaciones sobre tres asientos y el tope se rompería en el momento en que
 * las aceptaran — con la organización ya por encima de lo que paga y nada que
 * se pueda hacer salvo echar a alguien. Se cuenta al invitar y se libera al
 * cancelar o al caducar.
 */
export enum MembershipStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
}

/** Una organización, tal y como la ve quien pertenece a ella. */
export interface OrganizationView {
  id: string;
  kind: OrganizationKind;
  /** `null` en la personal, que no tiene y no la enseña nadie. */
  name: string | null;
  slug: string | null;
  ownerUserId: string;
  tier: PlanTier;
  /** Tu papel dentro. Lo resuelve el gateway contra quien pregunta. */
  myRole: OrganizationRole;
  /** Asientos pagados. `1` en la personal. */
  seats: number;
  /** Asientos gastados: miembros activos **más invitaciones vivas**. */
  seatsUsed: number;
  createdAt: string;
}

/** Una fila de la lista de miembros del portal. */
export interface OrganizationMemberView {
  userId: string | null;
  /** El correo al que se invitó. Es lo único que hay antes de que acepten. */
  email: string;
  name: string | null;
  role: OrganizationRole;
  status: MembershipStatus;
  invitedAt: string;
  joinedAt: string | null;
}

export class CreateOrganizationBodyDto {
  @ApiProperty({ description: 'Cómo se llama la organización', example: 'Estudio Nordeste' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  /**
   * Con qué plan nace.
   *
   * ⚠️ Se valida contra los cinco y **se vuelve a comprobar que sea de
   * `ENTERPRISE`** en el servicio: `@IsIn(PLAN_TIERS)` acepta `PRO`, que es un
   * plan real y no vale aquí. Un `@IsIn` con la lista corta habría bastado, pero
   * entonces el mensaje de error diría «debe ser TEAM o BUSINESS» sin decir por
   * qué, y quien lo lea desde fuera no sabe que hay dos familias.
   */
  @ApiProperty({ enum: [PlanTier.TEAM, PlanTier.BUSINESS] })
  @IsIn([PlanTier.TEAM, PlanTier.BUSINESS])
  tier: PlanTier;

  @ApiProperty({ description: 'Asientos con los que se contrata', example: 5 })
  @IsInt()
  @Min(1)
  @Max(500)
  seats: number;
}

export class RenameOrganizationBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
}

export class InviteOrganizationMemberBodyDto {
  /**
   * A quién se invita.
   *
   * **Por correo y no por `userId`**, y no es comodidad: quien invita a un
   * compañero no sabe su identificador, y buscarlo por correo desde la pantalla
   * significaría un endpoint que dice si una dirección tiene cuenta —que es un
   * enumerador de usuarios—. Aquí el correo entra y no sale: si existe cuenta se
   * ata, y si no, la invitación espera.
   */
  @ApiProperty({ example: 'alguien@ejemplo.com' })
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiPropertyOptional({ enum: [OrganizationRole.ADMIN, OrganizationRole.MEMBER] })
  @IsOptional()
  @IsIn([OrganizationRole.ADMIN, OrganizationRole.MEMBER])
  role?: OrganizationRole;
}

export class ChangeOrganizationMemberRoleBodyDto {
  /**
   * ⚠️ `OWNER` **no está en la lista**, y no se puede conceder por aquí.
   *
   * Hay exactamente uno y es quien paga: convertir a otro en dueño es
   * traspasar la suscripción, que tiene su propia ruta y su propia
   * confirmación. Dejarlo como un valor más de este desplegable haría que un
   * `ADMIN` pudiera regalarse la organización con un `PATCH`.
   */
  @ApiProperty({ enum: [OrganizationRole.ADMIN, OrganizationRole.MEMBER] })
  @IsIn([OrganizationRole.ADMIN, OrganizationRole.MEMBER])
  role: OrganizationRole;
}

export class ChangeSeatsBodyDto {
  @ApiProperty({ description: 'Asientos totales que se quieren tener', example: 12 })
  @IsInt()
  @Min(1)
  @Max(500)
  seats: number;
}

export class AcceptInvitationBodyDto {
  @ApiProperty({ description: 'El token del enlace del correo' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}

export class OrganizationIdParamDto {
  @ApiProperty()
  @IsUUID()
  organizationId: string;
}
