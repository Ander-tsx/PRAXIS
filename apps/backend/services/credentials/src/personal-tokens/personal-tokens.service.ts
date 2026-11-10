import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import {
  type CreatedPersonalToken,
  type ExchangedPersonalToken,
  PAT_DEFAULT_EXPIRY_DAYS,
  PAT_MAX_PER_USER,
  PAT_PREFIX,
  PAT_SCOPES,
  type PatScope,
  type PersonalTokenView,
  agentKindFromName,
} from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';

/** Valor del claim `typ` que exige `JwtGuard` en el gateway. */
const TOKEN_ACCESO = 'access';

/**
 * Cuánto vive el JWT que se emite al canjear un token personal.
 *
 * Corto a propósito (I4): el token personal se valida en **cada** llamada al
 * MCP, así que revocarlo corta al instante; este JWT solo cubre las peticiones
 * de esa llamada.
 */
const VIDA_DEL_ACCESO = '2m';

/** Cada cuánto se escribe `lastUsedAt`. Más fino sería una escritura por llamada. */
const LAST_USED_GRANO_MS = 60_000;

type Fila = {
  id: string;
  name: string;
  organizationId: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/**
 * Los tokens personales de acceso para el MCP (docs/PLAN-MCP.md, M1–M2).
 *
 * ⚠️ **Aquí no se comprueba la organización ni el plan.** credentials no sabe
 * de organizaciones: la pertenencia, el plan y el interruptor de la
 * organización los mira el gateway antes de crear y en cada llamada. Lo de aquí
 * es la identidad: el hash, la caducidad, la revocación y el estado de la
 * cuenta.
 */
@Injectable()
export class PersonalTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private vista(fila: Fila): PersonalTokenView {
    return {
      id: fila.id,
      name: fila.name,
      organizationId: fila.organizationId,
      prefix: fila.prefix,
      scopes: fila.scopes as PatScope[],
      expiresAt: fila.expiresAt?.toISOString() ?? null,
      lastUsedAt: fila.lastUsedAt?.toISOString() ?? null,
      revokedAt: fila.revokedAt?.toISOString() ?? null,
      createdAt: fila.createdAt.toISOString(),
    };
  }

  /** Lo que se le devuelve a quien lista. Sin `tokenHash`, nunca (I3). */
  private readonly seleccion = {
    id: true,
    name: true,
    organizationId: true,
    prefix: true,
    scopes: true,
    expiresAt: true,
    lastUsedAt: true,
    revokedAt: true,
    createdAt: true,
  } as const;

  /**
   * Crea un token y lo devuelve en claro **una sola vez**.
   *
   * Los alcances se normalizan: sin duplicados y en el orden de `PAT_SCOPES`.
   * El tope de `PAT_MAX_PER_USER` cuenta solo los vivos —ni revocados ni
   * caducados—: revocar uno tiene que dejar sitio para otro.
   */
  async crear(datos: {
    userId: string;
    organizationId: string;
    name: string;
    scopes: string[];
    expiresInDays?: number;
  }): Promise<CreatedPersonalToken> {
    const scopes = PAT_SCOPES.filter((scope) => datos.scopes.includes(scope));
    if (scopes.length === 0) {
      throw new RpcException({ statusCode: 400, message: 'Elige al menos un permiso.' });
    }

    const ahora = new Date();
    const vivos = await this.prisma.personalAccessToken.count({
      where: {
        userId: datos.userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }],
      },
    });
    if (vivos >= PAT_MAX_PER_USER) {
      throw new RpcException({
        statusCode: 409,
        message: `Ya tienes ${PAT_MAX_PER_USER} tokens activos. Revoca alguno para crear otro.`,
      });
    }

    const dias = datos.expiresInDays ?? PAT_DEFAULT_EXPIRY_DAYS;
    const expiresAt = dias > 0 ? new Date(ahora.getTime() + dias * 86_400_000) : null;

    const token = `${PAT_PREFIX}${randomBytes(32).toString('base64url')}`;
    const fila = await this.prisma.personalAccessToken.create({
      data: {
        userId: datos.userId,
        organizationId: datos.organizationId,
        name: datos.name.trim(),
        tokenHash: this.hash(token),
        prefix: token.slice(0, PAT_PREFIX.length + 8),
        scopes,
        expiresAt,
      },
      select: this.seleccion,
    });

    return { token, personalToken: this.vista(fila) };
  }

  /** Los de esta persona, los más nuevos primero. Revocados incluidos. */
  async listar(userId: string): Promise<PersonalTokenView[]> {
    const filas = await this.prisma.personalAccessToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: this.seleccion,
    });
    return filas.map((fila) => this.vista(fila));
  }

  /**
   * Revoca uno. Solo los propios: el de otra persona responde 404 igual que
   * uno que no existe, para no confirmar que existe.
   */
  async revocar(userId: string, id: string): Promise<PersonalTokenView> {
    const fila = await this.prisma.personalAccessToken.findFirst({ where: { id, userId } });
    if (!fila) throw new RpcException({ statusCode: 404, message: 'Ese token no existe.' });

    const revocado = await this.prisma.personalAccessToken.update({
      where: { id },
      data: { revokedAt: fila.revokedAt ?? new Date() },
      select: this.seleccion,
    });
    return this.vista(revocado);
  }

  /** Revoca todos los de una persona. Lo llama el cambio de contraseña (I4). */
  async revocarTodos(userId: string): Promise<void> {
    const ahora = new Date();
    await this.prisma.personalAccessToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: ahora },
    });
    /* Y las conexiones por OAuth: el token de Kyloo que lleva el cliente no
       caduca con la contraseña de Praxis, así que la fila es lo único que corta. */
    await this.prisma.mcpConnection.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: ahora },
    });
  }

  /**
   * Canjea un token en claro por un JWT de acceso de vida corta (M5).
   *
   * Responde siempre **el mismo 401** si no vale, sea cual sea el motivo: decir
   * «está revocado» a quien no lo tiene confirmaría que existió.
   *
   * 🔴 **El estado de la cuenta se mira en cada canje**, igual que en el
   * refresco de sesión: suspender a alguien tiene que dejar fuera también a su
   * agente.
   */
  async canjear(token: string): Promise<ExchangedPersonalToken> {
    const noVale = () =>
      new RpcException({ statusCode: 401, message: 'Token de acceso no válido o caducado.' });

    if (typeof token !== 'string' || !token.startsWith(PAT_PREFIX)) throw noVale();

    const fila = await this.prisma.personalAccessToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: { select: { status: true } } },
    });

    const ahora = new Date();
    if (
      !fila ||
      fila.revokedAt ||
      (fila.expiresAt && fila.expiresAt <= ahora) ||
      fila.user.status !== 'ACTIVE'
    ) {
      throw noVale();
    }

    if (!fila.lastUsedAt || ahora.getTime() - fila.lastUsedAt.getTime() > LAST_USED_GRANO_MS) {
      await this.prisma.personalAccessToken
        .update({ where: { id: fila.id }, data: { lastUsedAt: ahora } })
        .catch(() => undefined);
    }

    const accessToken = await this.jwt.signAsync(
      {
        sub: fila.userId,
        typ: TOKEN_ACCESO,
        /* La marca de coautoría: la firma el servidor y no sale del gateway. */
        via: 'mcp',
        agentId: fila.id,
        agentName: fila.name,
        agentKind: agentKindFromName(fila.name),
      },
      { expiresIn: VIDA_DEL_ACCESO },
    );

    return {
      personalTokenId: fila.id,
      userId: fila.userId,
      organizationId: fila.organizationId,
      scopes: fila.scopes as PatScope[],
      accessToken,
    };
  }
}
