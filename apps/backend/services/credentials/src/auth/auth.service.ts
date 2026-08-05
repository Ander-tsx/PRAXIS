import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  RegisterDto,
  LoginDto,
  VerifyTokenDto,
  JwtPayloadDto,
} from '@praxis/contracts';

const SALT_ROUNDS = 10;
const TOKEN_CACHE_TTL = 300;  // 5 min
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 días

/**
 * Valores del claim `typ`. El gateway compara contra el primero; `refresh()`,
 * contra el segundo. Si cambian aquí, hay que cambiarlos en `jwt.guard.ts`.
 */
export const TOKEN_ACCESO = 'access';
export const TOKEN_REFRESCO = 'refresh';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private tokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * ⚠️ **El claim `typ` es lo que separa los dos tokens.**
   *
   * Los dos se firman con el mismo secreto y el mismo `sub`, así que sin él la
   * única diferencia era la duración — y eso no lo puede comprobar nadie. El
   * `JwtGuard` del gateway solo valida firma y `exp`, de modo que el refresh
   * token de 7 días abría toda la API igual que el de 15 minutos: la ventana
   * corta, que existe justo para limitar el daño de un token robado, no
   * contenía nada.
   *
   * A partir de aquí, cada token dice para qué sirve y quien lo recibe lo
   * comprueba: el gateway exige `access`, y `refresh()` exige `refresh`.
   */
  private async signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, typ: TOKEN_ACCESO });
  }

  private async signRefresh(userId: string): Promise<string> {
    const expiresIn = this.config.get<any>('REFRESH_TOKEN_EXPIRES_IN', '7d');
    return this.jwt.signAsync({ sub: userId, typ: TOKEN_REFRESCO }, { expiresIn });
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.credential.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new RpcException({
        statusCode: 409,
        message: 'El email ya está registrado',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const credential = await this.prisma.credential.create({
      data: {
        email: dto.email,
        passwordHash,
        user: {
          create: {
            firstName: '',
            lastName: '',
          },
        },
      },
      include: { user: true },
    });

    if (!credential.user) {
      throw new Error('User profile not found')
    }

    const userId = credential.user.id;
    const accessToken = await this.signAccess(userId);
    const refreshToken = await this.signRefresh(userId);

    await this.redis.set(`auth:session:${userId}`, { refreshToken }, SESSION_TTL);

    return { userId, accessToken, refreshToken };
  }

  async login(dto: LoginDto) {
    const credential = await this.prisma.credential.findUnique({
      where: { email: dto.email },
      include: { user: true },
    });

    if (!credential || !credential.user) {
      throw new RpcException({ statusCode: 401, message: 'Credenciales inválidas' });
    }

    const match = await bcrypt.compare(dto.password, credential.passwordHash);
    if (!match) {
      throw new RpcException({ statusCode: 401, message: 'Credenciales inválidas' });
    }

    if (credential.user.status !== 'ACTIVE') {
      throw new RpcException({ statusCode: 403, message: 'Cuenta suspendida o inactiva' });
    }

    const userId = credential.user.id;
    const accessToken = await this.signAccess(userId);
    const refreshToken = await this.signRefresh(userId);

    await this.redis.set(`auth:session:${userId}`, { refreshToken }, SESSION_TTL);

    return { userId, accessToken, refreshToken };
  }

  async verifyToken(dto: VerifyTokenDto): Promise<JwtPayloadDto> {
    const hash = this.tokenHash(dto.token);
    const cacheKey = `auth:token:${hash}`;

    const cached = await this.redis.get<JwtPayloadDto>(cacheKey);
    if (cached) return cached;

    let payload: JwtPayloadDto;
    try {
      payload = await this.jwt.verifyAsync<JwtPayloadDto>(dto.token);
    } catch {
      throw new RpcException({ statusCode: 401, message: 'Token inválido o expirado' });
    }

    const session = await this.redis.get(`auth:session:${payload.sub}`);
    if (!session) {
      throw new RpcException({ statusCode: 401, message: 'Sesión cerrada' });
    }

    await this.redis.set(cacheKey, payload, TOKEN_CACHE_TTL);
    return payload;
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayloadDto & { typ?: string };
    try {
      payload = await this.jwt.verifyAsync<JwtPayloadDto & { typ?: string }>(refreshToken);
    } catch {
      throw new RpcException({ statusCode: 401, message: 'Refresh token inválido o expirado' });
    }

    /**
     * La confusión en el sentido contrario: un access token es un JWT válido
     * con el mismo `sub`, así que sin esta comprobación se podía canjear por
     * otro y encadenar la sesión indefinidamente sin pasar nunca por el
     * refresh que sí está guardado en Redis.
     */
    if (payload.typ !== TOKEN_REFRESCO) {
      throw new RpcException({ statusCode: 401, message: 'Refresh token inválido o expirado' });
    }

    const sessionKey = `auth:session:${payload.sub}`;
    const session = await this.redis.get<{ refreshToken: string }>(sessionKey);

    if (!session || session.refreshToken !== refreshToken) {
      throw new RpcException({ statusCode: 401, message: 'Refresh token no válido' });
    }

    /**
     * ⚠️ **El estado de la cuenta se vuelve a comprobar aquí.**
     *
     * Sin esto, suspender a alguien con la sesión abierta **no le echaba nunca**:
     * este método verificaba la firma, comparaba con Redis y firmaba un access
     * nuevo sin mirar `status`, y el `proxy.ts` de cada zona renueva en cada
     * navegación mientras el refresh viva. La suspensión solo impedía un login
     * nuevo — el único que esa persona no necesita.
     *
     * `setStatus` ya borra `auth:session:<id>`, así que el `if` de arriba
     * bastaría en el camino normal. Esta consulta cubre el resto: un cambio de
     * estado hecho por una migración, un arreglo a mano en la base, o un futuro
     * camino que se olvide de invalidar. Es una lectura por renovación —cada 15
     * minutos por sesión activa— y a cambio el estado de la cuenta manda siempre.
     */
    const credential = await this.prisma.credential.findFirst({
      where:  { user: { id: payload.sub } },
      select: { user: { select: { status: true } } },
    });

    if (credential?.user && credential.user.status !== 'ACTIVE') {
      /* Se retira la sesión: si no, cada navegación volvería a preguntar y a
         recibir el mismo 401. */
      await this.redis.del(sessionKey);
      throw new RpcException({ statusCode: 401, message: 'Cuenta suspendida o inactiva' });
    }

    const accessToken = await this.signAccess(payload.sub);
    return { accessToken };
  }

  async logout(userId: string) {
    await this.redis.del(`auth:session:${userId}`);
    return { success: true };
  }
}
