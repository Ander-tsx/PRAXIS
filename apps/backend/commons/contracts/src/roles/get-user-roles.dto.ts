import { IsNotEmpty, IsUUID } from 'class-validator';

export class GetUserRolesDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;
}
