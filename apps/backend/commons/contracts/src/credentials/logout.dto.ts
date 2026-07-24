import { IsNotEmpty, IsUUID } from 'class-validator';

export class LogoutDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;
}
