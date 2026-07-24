import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class AddMemberDto {
  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectRoleId: string;
}

export class RemoveMemberDto {
  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsUUID('4')
  @IsNotEmpty()
  userId: string;
}

export class CheckPermissionDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @IsUUID('4')
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  permission: string;
}
