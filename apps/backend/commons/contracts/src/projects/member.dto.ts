import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Cuerpo de `POST /projects/:projectId/members`.
 *
 * ⚠️ Esto **no es invitar, es dar de alta**: recibe un `userId` y surte efecto
 * inmediato, sin aceptación ni estado pendiente. La interfaz usa las
 * invitaciones (`InviteMemberBodyDto`); esta ruta queda para altas
 * administrativas.
 */
export class AddMemberBodyDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectRoleId: string;
}

export class AddMemberDto extends AddMemberBodyDto {
  @IsUUID('4')
  projectId: string;
}

/**
 * Cuerpo de `POST /projects/:projectId/invitations`.
 *
 * Misma forma que dar de alta, pero el efecto es distinto: crea una invitación
 * **pendiente**. La membresía se crea cuando quien la recibe la acepta.
 */
export class InviteMemberBodyDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectRoleId: string;
}

/**
 * Cuerpo de `PATCH /projects/:projectId/members/:userId`.
 *
 * Cambiar el rol de alguien que **ya es miembro**. No existía: la única forma
 * era sacarlo del proyecto y volver a meterlo, que le borraba la fecha de
 * entrada, le mandaba dos avisos y, entre las dos operaciones, lo dejaba sin
 * ningún permiso.
 */
export class ChangeMemberRoleBodyDto {
  @IsUUID('4')
  projectRoleId: string;
}

export class ChangeMemberRoleDto extends ChangeMemberRoleBodyDto {
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  userId: string;

  /** Quién lo cambia. Lo inyecta el gateway desde el token. */
  @IsUUID('4')
  requesterId: string;
}

/** Cuerpo de `DELETE /projects/:projectId/members`. */
export class RemoveMemberBodyDto {
  @IsUUID('4')
  userId: string;
}

export class RemoveMemberDto extends RemoveMemberBodyDto {
  @IsUUID('4')
  projectId: string;

  /**
   * Quién saca a la persona. Lo inyecta el gateway desde el token.
   *
   * Solo sirve para poder decirlo en el aviso: «X te sacó de Y». Sin esto el
   * aviso quedaba en pasiva y sin responsable.
   */
  @IsOptional()
  @IsUUID('4')
  requesterId?: string;
}

export class CheckPermissionDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectId: string;

  @IsString()
  permission: string;
}
