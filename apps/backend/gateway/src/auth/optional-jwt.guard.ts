import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

/**
 * Como `JwtGuard`, pero **deja pasar sin sesión**.
 *
 * Es para las rutas de un documento compartido (E8 de
 * `docs/PLAN-DOCUMENTOS.md`): con «cualquiera con el enlace» se puede leer sin
 * cuenta, y con cuenta se puede además editar o entrar por invitación. Quien
 * decide qué puede hacer cada uno es `DocumentAccessService`, no este guard.
 *
 * ⚠️ Un token presente **pero inválido** no se trata como anónimo en silencio:
 * se ignora, igual que si no viniera. No abre nada que no abra el enlace.
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) return true;

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
        algorithms: ['HS256'],
      });
      /* Solo un token de acceso: el refresh y el billete del tiempo real no son sesiones. */
      if (payload.typ === 'access') request.user = { userId: payload.sub };
    } catch {
      /* Caducado o falso: se sigue como anónimo. */
    }
    return true;
  }
}
