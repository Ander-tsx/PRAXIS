import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Request } from 'express';
import { firstValueFrom } from 'rxjs';

/**
 * Guard de las rutas de Alexa. Valida el alexaToken enviado en el encabezado Authorization: Bearer <token>.
 * La verificación consulta a alexa-service ({ cmd: 'alexa_verify_token' }), comprobando existencia,
 * expiración, estado de revocación y vigencia de la cuenta.
 */
@Injectable()
export class AlexaTokenGuard implements CanActivate {
  private readonly logger = new Logger(AlexaTokenGuard.name);

  constructor(@Inject('ALEXA_SERVICE') private readonly alexaClient: ClientProxy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) throw new UnauthorizedException('No alexa token provided');

    try {
      const result = await firstValueFrom(
        this.alexaClient.send<{ userId: string; linkId: string }>(
          { cmd: 'alexa_verify_token' },
          { token },
        ),
      );

      if (!result?.userId) {
        throw new UnauthorizedException('Invalid alexa token');
      }

      request.user = { userId: result.userId };
      (request as Request & { alexaLinkId?: string; voiceLinkId?: string }).alexaLinkId =
        result.linkId;
      (request as Request & { voiceLinkId?: string }).voiceLinkId = result.linkId;
      return true;
    } catch (error) {
      this.logger.warn(`Verificación de alexa token fallida: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid, expired or revoked alexa token');
    }
  }

  private extractToken(request: Request): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}

export { AlexaTokenGuard as VoiceTokenGuard };
