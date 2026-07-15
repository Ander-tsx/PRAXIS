import { IsUUID } from 'class-validator';

export class GetUserRolesDto {
  @IsUUID('4')
  userId: string;
}
