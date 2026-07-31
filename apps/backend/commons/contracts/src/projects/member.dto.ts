import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Cuerpo de `POST /projects/:projectId/members`.
 *
 * ⚠️ Esto **no es invitar, es dar de alta**: recibe un `userId` y surte efecto
 * inmediato, sin aceptación ni estado pendiente. No existe flujo de invitación
 * en el backend. Ver docs/frontend/PENDIENTES-BACKEND.md §12.
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
