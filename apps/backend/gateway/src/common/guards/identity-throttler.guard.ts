import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Limitador de peticiones que cuenta **por cuenta**, no por dirección IP.
 *
 * ## Por qué la IP no servía aquí
 *
 * El navegador no habla nunca con el gateway: toda petición cruza el proxy de su
 * zona o nace en el renderizado de servidor de Next. En los dos casos, quien
 * abre la conexión TCP es **el servidor de la zona**, así que `req.ip` es la
 * misma dirección para todo el mundo.
 *
 * El limitador contaba ahí: los 300 por minuto no eran de cada persona, eran de
 * **toda la plataforma junta**. Una pantalla que resolviera veinte perfiles uno
 * a uno gastaba veinte, y con unas pocas personas navegando a la vez el cubo se
 * vaciaba en segundos. A partir de ahí el gateway respondía 429 a peticiones
 * legítimas, y como las pantallas degradan en silencio (`.catch(() => null)`),
 * eso salía en la interfaz como perfiles que desaparecían y avatares en blanco
 * —el fallo de «Alguien que ya no está»— sin un solo error visible.
 *
 * Y al revés: como techo de seguridad tampoco valía. Un atacante con su propia
 * IP compartía cubo con los usuarios reales, así que agotarlo era una denegación
 * de servicio contra todos los demás en vez de un freno contra él.
 *
 * ## Cómo se identifica ahora
 *
 * Por el `sub` del token de acceso, **verificado**. No vale decodificarlo sin
 * comprobar la firma: cualquiera podría inventarse un `sub` distinto en cada
 * petición y saltarse el límite entero. La comprobación es un HMAC, del orden de
 * microsegundos, y despreciable al lado de la llamada al microservicio que viene
 * detrás.
 *
 * ⚠️ **No sustituye al `JwtGuard`.** Esto es contabilidad, no autorización: un
 * token válido aquí solo decide en qué cubo se cuenta la petición. Quién puede
 * entrar lo sigue decidiendo el guard del controlador, después. Si el token no
 * verifica, no se rechaza nada — se cuenta por IP y que el `JwtGuard` haga su
 * trabajo, que es donde ese error tiene el mensaje correcto.
 *
 * Lo anónimo —`/auth/login`, `/auth/register`— cae a la IP, que es lo único que
 * hay antes de tener sesión y donde el apretón de `auth.controller.ts` sigue
 * teniendo todo el sentido.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  /**
   * ⚠️ **Los dos `@Inject…` son imprescindibles y su ausencia no da error de
   * compilación.** `ThrottlerModuleOptions` y `ThrottlerStorage` son
   * **interfaces**, así que `design:paramtypes` las emite como `Object` y Nest
   * no sabría qué inyectar. La clase base los marca con estos mismos
   * decoradores, pero los decoradores de parámetro **no se heredan** al declarar
   * un constructor propio: sin ellos, el gateway arranca y muere resolviendo
   * dependencias.
   */
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request;

    const userId = this.userIdDelToken(request);
    /* Los dos prefijos evitan que un `userId` y una IP puedan colisionar nunca
       en la misma clave — hoy no pueden por su forma, pero eso es una casualidad
       de los formatos, no una garantía. */
    if (userId) return `user:${userId}`;

    return `ip:${this.ipDe(request)}`;
  }

  /** El `sub` del token de acceso, o `null` si no hay token o no verifica. */
  private userIdDelToken(request: Request): string | null {
    const [tipo, token] = request.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) return null;

    try {
      const payload = this.jwtService.verify<{ sub?: string; typ?: string }>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
        algorithms: ['HS256'],
      });

      /* Mismo criterio que `JwtGuard`: el refresh token no identifica a nadie
         para esto. Si se aceptara, habría dos cubos por persona. */
      if (payload.typ !== 'access') return null;

      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      /* Caducado, manipulado o de otro emisor. No es asunto de este guard. */
      return null;
    }
  }

  /**
   * La dirección de quien pregunta, para lo que no lleva sesión.
   *
   * `x-forwarded-for` **solo** se mira si `TRUSTED_PROXY_HOPS` lo permite: la
   * cabecera la puede escribir cualquiera que alcance el gateway, así que
   * creérsela sin más convierte el límite por IP en decorativo —basta con
   * cambiarla en cada intento—. Con el número de saltos configurado se lee la
   * entrada que puso **nuestro** intermediario y no la que trajo el cliente.
   */
  private ipDe(request: Request): string {
    const saltos = Number(this.configService.get<string>('TRUSTED_PROXY_HOPS') ?? 0);
    if (saltos <= 0) return request.socket.remoteAddress ?? request.ip ?? 'desconocida';

    const cadena = (request.headers['x-forwarded-for'] ?? '')
      .toString()
      .split(',')
      .map((parte) => parte.trim())
      .filter(Boolean);

    /* Se cuenta **desde el final**: los últimos los añaden nuestros propios
       intermediarios y son los únicos en los que se puede confiar. */
    return cadena[cadena.length - saltos] ?? request.socket.remoteAddress ?? 'desconocida';
  }
}
