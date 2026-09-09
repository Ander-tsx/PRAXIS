import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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
 * Los dos papeles con los que nace una organización.
 *
 * ⚠️ **Son nombres, no un enum**, y desde 2026-08-26 tampoco son el catálogo: una
 * organización define los suyos con un diccionario de `OrganizationPermission`,
 * igual que un proyecto define sus roles. Estos dos se crean con ella para que
 * nunca esté sin ninguno, y se pueden renombrar y editar como cualquier otro.
 *
 * ⚠️ **Van en español porque se ven en pantalla.** Es la misma regla que los
 * roles de proyecto («Administrador», «Scrum Master»): el identificador es
 * inglés, el nombre que lee una persona no.
 *
 * 🔴 **`OWNER` ya no está aquí, y no es un olvido.** Ser dueño de la
 * organización no es un papel: se resuelve comparando con
 * `Organization.ownerUserId` **antes** de mirar ninguno, igual que `ownerId` en
 * un proyecto. Guardarlo como fila permitiría quitarse permisos a uno mismo, que
 * es la forma más rápida de dejar una organización sin nadie que la administre y
 * sin salida.
 */
export const ORG_ROLE_ADMIN_NAME = 'Administración';
export const ORG_ROLE_MEMBER_NAME = 'Miembro';

/**
 * Lo que se puede hacer **a** una organización.
 *
 * ⚠️ **Es un vocabulario distinto del de proyecto, no el mismo a otra escala.**
 * `canCreateTask` no significa nada aquí y `canManageBilling` no significa nada
 * dentro de un tablero. Por eso son dos listas y dos pantallas: juntarlas
 * obligaría a un selector de proyecto que repite la navegación que ya existe.
 */
export enum OrganizationPermission {
  /**
   * El nombre y los ajustes de la organización.
   *
   * ⚠️ Se separó de `canManageMembers` al escribirlo: son dos cosas distintas y
   * una empresa quiere que quien lleva el equipo pueda arreglar una errata en el
   * nombre sin poder, además, tocar quién está dentro.
   */
  CAN_MANAGE_ORGANIZATION = 'canManageOrganization',
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
    [OrganizationPermission.CAN_MANAGE_ORGANIZATION]: true,
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
 * ¿Caben estos permisos dentro de los que tiene quien los reparte?
 *
 * 🔴 **Es lo que impide escalar privilegios, y sin esto el modelo se rompe
 * entero.** Quien tiene `canManageMembers` puede crear papeles y asignarlos; si
 * pudiera meter en uno un permiso que él no tiene —`canManageBilling`, por
 * ejemplo— le bastaría con creárselo, asignárselo y ya estaría tocando la
 * tarjeta de crédito de la empresa. Con esta comprobación, repartir permisos
 * nunca crea permisos.
 *
 * El dueño la pasa siempre, porque los tiene todos: no es una excepción escrita
 * aparte, sale solo.
 */
export function cabenEn(
  permisos: OrganizationPermissions,
  losDeQuienReparte: OrganizationPermissions,
): boolean {
  return ORGANIZATION_PERMISSIONS.every((clave) => !permisos[clave] || losDeQuienReparte[clave]);
}

/** Un papel de la organización, tal y como lo pinta el portal. */
export interface OrganizationRoleView {
  id: string;
  name: string;
  permissions: OrganizationPermissions;
  /** El que se asigna a quien entra sin decir cuál. Uno por organización. */
  isDefault: boolean;
  /** Cuánta gente lo lleva. Para no dejar borrar uno que está en uso. */
  miembros: number;
}

/**
 * Una plantilla de rol de proyecto.
 *
 * ⚠️ **Solo afecta a los proyectos nuevos.** Cambiar una plantilla no reescribe
 * los roles de los proyectos que ya existen: sería borrar el trabajo de quien
 * los ajustó, en una pantalla que habla de otra cosa. El puente va en una sola
 * dirección y solo se cruza al crear.
 *
 * `permissions` son permisos **de proyecto** (`ProjectPermission`), no de
 * organización: son los dos vocabularios distintos, y este es el otro.
 */
export interface ProjectRoleTemplateView {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
}

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
  /**
   * Cómo se llama.
   *
   * ⚠️ **Ya no es `null` en la personal.** Desde 2026-08-26 la personal tiene
   * nombre y sale en el selector del sidebar: una organización que no se ve es
   * un sitio donde no se puede meter un proyecto. Se sigue tipando anulable
   * porque el gateway puede no saber el nombre de quien la estrena, y entonces
   * la pantalla pone uno genérico en vez de dejar un hueco.
   */
  name: string | null;
  slug: string | null;
  ownerUserId: string;
  tier: PlanTier;
  /** Si quien pregunta es quien paga. Lo puede todo, y no se le quita. */
  soyDueno: boolean;
  /** Cómo se llama tu papel. `null` si eres el dueño: no llevas ninguno. */
  myRoleName: string | null;
  /**
   * Lo que puedes hacer aquí dentro, ya resuelto.
   *
   * ⚠️ **Viene resuelto y no como el nombre de un papel** para que la pantalla
   * no tenga que buscarlo en una lista que quizá no ha pedido. Y en el dueño son
   * todos, sin mirar ninguna fila.
   */
  myPermissions: OrganizationPermissions;
  /** Asientos pagados. `1` en la personal. */
  seats: number;
  /**
   * Cuánta gente cabe **de verdad**. `null` = sin tope (solo Empresa).
   *
   * ⚠️ **No es `seats`, y la diferencia solo aparece cuando duele.** `seats` es
   * lo que se contrató en Stripe; esto es el menor entre eso y lo que admite el
   * plan, que es lo que aplica la puerta de invitar (A1 de
   * `docs/PLAN-ASIENTOS-CONGELADOS.md`). Coinciden siempre salvo después de
   * bajar de plan o cancelar: ahí `seats` conserva el número de la última
   * suscripción y enseñarlo a solas deja la pantalla diciendo «3 de 15» mientras
   * el cuarto invitado recibe un error.
   */
  seatsCap: number | null;
  /** Asientos gastados: miembros activos **más invitaciones vivas**. */
  seatsUsed: number;
  /**
   * Identidad visual, elegida en el modal de configuración. `null` = sin
   * elegir, y el frontend cae al monograma de letras derivado del `id`.
   * `iconKey` es un nombre de icono de `lucide-react`; `color`, un `#rrggbb`.
   */
  iconKey: string | null;
  color: string | null;
  createdAt: string;
}

/** Una fila de la lista de miembros del portal. */
export interface OrganizationMemberView {
  userId: string | null;
  /** El correo al que se invitó. Es lo único que hay antes de que acepten. */
  email: string;
  name: string | null;
  /** El papel que lleva. `null` en el dueño, que no lleva ninguno. */
  roleId: string | null;
  roleName: string | null;
  /** Quien paga. Ni se le cambia el papel ni se le saca. */
  isOwner: boolean;
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

  /* 🔴 **Ni `tier` ni `seats`, y es de 2026-08-27.** El cuerpo pedía con qué
     plan de empresa nacía y cuántos asientos se compraban: una decisión
     comercial exigida **antes** de que la organización existiera, a alguien que
     todavía no sabe qué es. Y era mentira además — el plan lo concede el webhook
     de Stripe, nunca esta llamada, así que aceptar `tier: 'BUSINESS'` aquí no
     daba BUSINESS: creaba una organización gratuita con una promesa dentro.

     Ahora nace en `FREE` con los asientos del plan gratuito, y se amplía desde
     su portal el día que el equipo o los proyectos no quepan. */
}

/**
 * Cuerpo de `PATCH /organizations/:id`: la identidad de la organización.
 *
 * Nació renombrando y solo eso —de ahí el nombre—; desde el modal de
 * configuración también lleva el icono y el color. `name` sigue siendo
 * obligatorio (el modal siempre lo manda); `iconKey` y `color` son opcionales y
 * admiten `null` para volver al monograma.
 */
export class RenameOrganizationBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  /**
   * Nombre kebab-case de un icono de `lucide-react` de la lista curada del
   * frontend. `null` lo borra y vuelve al monograma. Se valida la forma, no que
   * el icono exista: la lista canónica vive en el cliente.
   */
  @ApiPropertyOptional({ nullable: true, example: 'rocket' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z][a-z0-9-]*$/, { message: 'iconKey no tiene forma de nombre de icono' })
  iconKey?: string | null;

  /** Color de acento en `#rrggbb`. `null` lo borra. */
  @ApiPropertyOptional({ nullable: true, example: '#7c5cff' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color debe ser un hexadecimal #rrggbb' })
  color?: string | null;
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

  /**
   * Con qué papel entra. Si no se dice, el que la organización tenga por
   * defecto — que al crearse es «Miembro».
   */
  @ApiPropertyOptional({ description: 'Id del papel de la organización' })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}

export class ChangeOrganizationMemberRoleBodyDto {
  /**
   * El papel nuevo.
   *
   * ⚠️ **Ser dueño no es un papel y por eso no se puede conceder por aquí.** Hay
   * exactamente uno, es quien paga, y convertir a otro en dueño es traspasar la
   * suscripción — tiene su propia ruta y su propia confirmación. Si fuera un
   * valor más de este desplegable, quien administra podría regalarse la
   * organización con un `PATCH`.
   *
   * ⚠️ Y **no se puede asignar un papel con permisos que no tengas**: repartir
   * permisos no puede crear permisos. Lo comprueba `cabenEn` en el servicio.
   */
  @ApiProperty({ description: 'Id del papel de la organización' })
  @IsUUID()
  roleId: string;
}

/** Crear o editar un papel de la organización. */
export class OrganizationRoleBodyDto {
  @ApiProperty({ example: 'Coordinación' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  /**
   * El diccionario de permisos.
   *
   * ⚠️ **Diccionario, nunca un array.** Se normaliza al entrar con
   * `normalizarPermisosOrg`, que descarta lo que no esté en el vocabulario: un
   * permiso retirado no puede seguir concediendo nada desde un cuerpo viejo.
   */
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  @IsObject()
  permissions: Record<string, unknown>;
}

/** Guardar una plantilla de rol de proyecto. */
export class ProjectRoleTemplateBodyDto {
  @ApiProperty({ example: 'QA' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  @IsObject()
  permissions: Record<string, unknown>;
}

/** A quién se le traspasa la organización. */
export class TransferOrganizationBodyDto {
  /**
   * ⚠️ **Tiene que ser ya miembro activo.** Traspasarla a alguien de fuera
   * dejaría la organización con un dueño que no está dentro, sin asiento y sin
   * forma de entrar en su propio portal.
   */
  @ApiProperty({ description: 'Quién pasa a ser el dueño' })
  @IsUUID()
  userId: string;
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
