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
  /**
   * La de una persona: un asiento, y la que se crea al registrarse.
   *
   * ⚠️ **Ya no es invisible, y el cambio es de 2026-08-26.** Mientras una
   * organización solo repartía topes, una sin nombre que no salía en ninguna
   * pantalla tenía sentido. Desde que **contiene** los proyectos, una
   * organización que no se ve es un sitio donde no se puede meter nada: tiene
   * nombre, sale en el selector del sidebar y es donde viven los proyectos de
   * quien trabaja solo.
   *
   * Lo que sí sigue en pie es el índice único parcial: **una sola `PERSONAL` por
   * cuenta**, y varias `ENTERPRISE` del mismo dueño sí. Va a mano en la
   * migración con un `WHERE kind = 'PERSONAL'`, porque Prisma no sabe
   * expresarlo — sin él, dos peticiones simultáneas crean dos y la segunda se
   * queda con las cuotas.
   */
  PERSONAL = 'PERSONAL',
  /** La que se contrata con nombre, asientos y quien la administre. */
  ENTERPRISE = 'ENTERPRISE',
}

/**
 * Los papeles de arranque de una organización.
 *
 * ⚠️ **Son la semilla, no el catálogo cerrado.** Desde 2026-08-26 una
 * organización define sus propios papeles con un diccionario de
 * `OrganizationPermission`, igual que un proyecto define sus roles. Estos tres
 * son los que se crean con ella para que nunca esté sin ninguno; `OWNER` además
 * es especial y no se toca (ver `PERMISOS_DE_DUENO`).
 *
 * ⚠️ **Siguen sin tener nada que ver con los roles de proyecto ni con el rol
 * global.** Son tres capas, y esta es la tercera.
 *
 * 🔴 **Lo que cambió, y el comentario anterior decía al revés:** un papel de la
 * organización **sí** puede abrir la puerta de un proyecto —`canViewAllProjects`
 * enseña la lista, `canManageAllProjects` deja entrar autoconcediéndose el
 * acceso—, y solo dejando rastro en el registro de auditoría y avisando a quien
 * es responsable del proyecto. Lo que sigue sin abrir nada es **el plan**: pagar
 * no da permisos. Sin esto, una empresa no tiene forma de recuperar un proyecto
 * cuando su responsable se va, que es exactamente por lo que paga.
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
 * Lo que se puede hacer **a** una organización.
 *
 * ⚠️ **Es un vocabulario distinto del de proyecto, no el mismo a otra escala.**
 * `canCreateTask` no significa nada aquí y `canManageBilling` no significa nada
 * dentro de un tablero. Por eso son dos listas y dos pantallas: juntarlas
 * obligaría a un selector de proyecto que repite la navegación que ya existe.
 */
export enum OrganizationPermission {
  /** Crear proyectos dentro de la organización. */
  CAN_CREATE_PROJECT = 'canCreateProject',
  /** Ver la lista de todos los proyectos — **no** entrar en ellos. */
  CAN_VIEW_ALL_PROJECTS = 'canViewAllProjects',
  /** Archivar, suspender y reasignar responsable de cualquiera. Deja rastro. */
  CAN_MANAGE_ALL_PROJECTS = 'canManageAllProjects',
  /** Mandar invitaciones, que ocupan asiento desde que se mandan. */
  CAN_INVITE_MEMBERS = 'canInviteMembers',
  /** Cambiar papeles y sacar gente. */
  CAN_MANAGE_MEMBERS = 'canManageMembers',
  /** Editar las plantillas con que nacen los proyectos nuevos. */
  CAN_MANAGE_ROLE_TEMPLATES = 'canManageRoleTemplates',
  /** Plan, asientos y facturas. */
  CAN_MANAGE_BILLING = 'canManageBilling',
  /** El registro de auditoría de la organización. */
  CAN_VIEW_AUDIT_LOG = 'canViewAuditLog',
}

export const ORGANIZATION_PERMISSIONS = Object.values(OrganizationPermission);

/**
 * Los permisos de un papel.
 *
 * 🔴 **Un diccionario de booleanos, nunca un array.** Es la misma forma que los
 * roles de proyecto, y allí se aprendió tarde: los roles creados antes del
 * validador siguen guardados como array y hay que normalizarlos al leer. Aquí el
 * validador va desde el primer día — `normalizarPermisosOrg` es la única puerta
 * de entrada, y acepta el array solo para no tragarse un dato viejo en silencio.
 */
export type OrganizationPermissions = Record<OrganizationPermission, boolean>;

/** Un diccionario con todo a `false`. El punto de partida de un papel nuevo. */
export function permisosOrgVacios(): OrganizationPermissions {
  return Object.fromEntries(
    ORGANIZATION_PERMISSIONS.map((clave) => [clave, false]),
  ) as OrganizationPermissions;
}

/**
 * Lo que puede quien es dueño de la organización: todo, y no se puede editar.
 *
 * ⚠️ **No es un papel guardado en la base.** Es una constante, y se resuelve
 * antes de mirar ningún papel — igual que `ownerId` en un proyecto es un bypass
 * y no un rol. Guardarlo como fila permitiría dejarse sin permisos a uno mismo,
 * que es la forma más rápida de dejar una organización sin nadie que la
 * administre y sin salida.
 */
export function permisosDeDueno(): OrganizationPermissions {
  return Object.fromEntries(
    ORGANIZATION_PERMISSIONS.map((clave) => [clave, true]),
  ) as OrganizationPermissions;
}

/** Lo que trae el papel «Administración» al crearse la organización. */
export function permisosDeAdministracion(): OrganizationPermissions {
  return {
    ...permisosOrgVacios(),
    [OrganizationPermission.CAN_CREATE_PROJECT]: true,
    [OrganizationPermission.CAN_VIEW_ALL_PROJECTS]: true,
    [OrganizationPermission.CAN_MANAGE_ALL_PROJECTS]: true,
    [OrganizationPermission.CAN_INVITE_MEMBERS]: true,
    [OrganizationPermission.CAN_MANAGE_MEMBERS]: true,
    [OrganizationPermission.CAN_MANAGE_ROLE_TEMPLATES]: true,
    [OrganizationPermission.CAN_VIEW_AUDIT_LOG]: true,
  };
}

/**
 * Lo que trae el papel «Miembro» al crearse la organización.
 *
 * Solo crear proyectos. Es lo que hace que entrar en una organización sirva de
 * algo el primer día sin que nadie tenga que configurar nada.
 */
export function permisosDeMiembro(): OrganizationPermissions {
  return {
    ...permisosOrgVacios(),
    [OrganizationPermission.CAN_CREATE_PROJECT]: true,
  };
}

/**
 * Deja un diccionario utilizable venga como venga.
 *
 * ⚠️ **Toda lectura pasa por aquí.** Una clave que falte se lee como `false`, no
 * como `undefined`: comparar `undefined` con `===  true` da `false` igualmente,
 * pero pintarlo en una pantalla da una casilla en estado indeterminado y un
 * `Select` sin valor. Y una clave que sobre se descarta — un permiso que se
 * retiró del vocabulario no puede seguir concediendo nada desde una fila vieja.
 */
export function normalizarPermisosOrg(bruto: unknown): OrganizationPermissions {
  const base = permisosOrgVacios();

  // Un array es el formato viejo de los roles de proyecto: la lista de las
  // claves que están a `true`. No debería llegar nunca por aquí, pero tragarlo
  // en silencio como «ningún permiso» sería peor que entenderlo.
  if (Array.isArray(bruto)) {
    for (const clave of bruto) {
      if (typeof clave === 'string' && clave in base) {
        base[clave as OrganizationPermission] = true;
      }
    }
    return base;
  }

  if (bruto && typeof bruto === 'object') {
    for (const [clave, valor] of Object.entries(bruto as Record<string, unknown>)) {
      if (clave in base) base[clave as OrganizationPermission] = valor === true;
    }
  }

  return base;
}

/**
 * El código de un 403 por no tener asiento en la organización.
 *
 * ⚠️ **Es un 403 distinto, y por eso tiene código propio.** Un `FORBIDDEN`
 * normal se arregla pidiéndole el permiso a quien administra el proyecto; este
 * se arregla dándole un **asiento** a la persona, que es otra conversación, con
 * otra pantalla y otro coste. Y no es un `QUOTA_EXCEEDED`: no se ha agotado
 * nada, es que esa persona no está dentro.
 *
 * Tercer código del mismo patrón, con `PROJECT_SUSPENDED_CODE` y
 * `QUOTA_EXCEEDED_CODE`. Tres puertas, tres salidas distintas en la interfaz.
 */
export const NOT_IN_ORG_CODE = 'NOT_IN_ORG';

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
