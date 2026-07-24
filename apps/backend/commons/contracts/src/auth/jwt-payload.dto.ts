import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class JwtPayloadDto {
  @IsString()
  @IsNotEmpty()
  sub: string;

  @IsInt()
  iat: number;

  @IsInt()
  exp: number;
}
