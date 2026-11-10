import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { asAgentKind } from '@praxis/contracts';
import { Request } from 'express';

/**
 * Valor del claim `typ` que emite credentials-service para el token de acceso.
 * Si cambia allí, hay que cambiarlo aquí.
 */
const TOKEN_ACCESO = 'access';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) throw new UnauthorizedException('No token provided');

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
        /**
         * `algorithms` explícito. Hoy no hay agujero —con un secreto de tipo
         * `string`, `jsonwebtoken` ya se limita a la familia HS— pero eso es un
         * comportamiento por defecto de una librería, no una decisión nuestra.
         * Escrito, deja de depender de que no cambie.
         */
        algorithms: ['HS256'],
      });

      /**
       * ⚠️ **Sin esta línea, el refresh token abre toda la API.**
       *
       * Los dos tokens se firman con el mismo secreto y el mismo `sub`; la
       * única diferencia era `expiresIn`, que aquí no se puede distinguir. El
       * resultado: junto al access token de 15 minutos viajaba uno de 7 días
       * con exactamente los mismos poderes, y la ventana corta no contenía nada.
       */
      if (payload.typ !== TOKEN_ACCESO) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      request.user = {
        userId: payload.sub,
        /* La marca de coautoría del MCP. Solo existe si la firmó credentials (una sesión
           normal no la trae) **y** la organización la tiene encendida: eso lo dice la
           cabecera que pone el MCP en su llamada interna. Una persona que mandara la
           cabecera a mano no consigue nada: sin la marca firmada no hay a quién anotar. */
        ...(payload.via === 'mcp' && request.headers['x-praxis-agent-attribution'] === 'on'
          ? {
              agent: {
                via: 'mcp' as const,
                agentId: String(payload.agentId ?? ''),
                agentName: String(payload.agentName ?? 'Agente de IA'),
                agentKind: asAgentKind(payload.agentKind),
              },
            }
          : {}),
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}
