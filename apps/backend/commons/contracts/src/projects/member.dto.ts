import { IsString, IsUUID } from 'class-validator';

export class AddMemberDto {
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectRoleId: string;
}

export class RemoveMemberDto {
  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  userId: string;
}

export class CheckPermissionDto {
  @IsUUID('4')
  userId: string;

  @IsUUID('4')
  projectId: string;

  @IsString()
  permission: string;
}
