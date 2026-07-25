import { IsInt, IsString } from 'class-validator';

export class JwtPayloadDto {
  @IsString()
  sub: string;

  @IsInt()
  iat: number;

  @IsInt()
  exp: number;
}
