import { IsString } from 'class-validator';

export class AuthResponseDto {
  @IsString()
  access_token: string;
}
