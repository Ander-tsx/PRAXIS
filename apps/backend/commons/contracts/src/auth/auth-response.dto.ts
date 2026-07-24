import { IsNotEmpty, IsString } from 'class-validator';

export class AuthResponseDto {
  @IsString()
  @IsNotEmpty()
  access_token: string;
}
