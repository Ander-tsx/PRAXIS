import { IsString, IsUUID } from 'class-validator';

export class LogoutDto {
  @IsUUID('4')
  userId: string;
}
