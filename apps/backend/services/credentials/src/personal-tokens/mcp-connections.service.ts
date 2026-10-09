import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import type { ExchangedMcpConnection, McpConnectionView } from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';

/** Valor del claim `typ` que exige `JwtGuard` en el gateway. */
const TOKEN_ACCESO = 'access';
/** Igual que el canje de un token personal: solo cubre las peticiones de esa llamada. */
const VIDA_DEL_ACCESO = '2m';
const LAST_USED_GRANO_MS = 60_000;
/** Una conexión que nunca llegó a usarse (se abandonó el consentimiento) deja de listarse. */
const SIN_USO_MS = 24 * 3_600_000;

type Fila = {
  id: string;
  clientId: string;
  clientName: string;
  allowedOrgIds: string[];
  activeOrgId: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/**
 * Las conexiones de clientes de IA al MCP por OAuth.
 *
 * ⚠️ Como los tokens personales, **aquí no se comprueba la organización ni el
 * plan**: credentials no sabe de organizaciones. La pertenencia a cada una la
 * valida el gateway antes de guardar, y la actual se mira en cada llamada.
 * Lo de aquí es la identidad: que la conexión exista, no esté revocada, y que
 * quien presenta el token sea la persona a la que se ató.
 */
@Injectable()
export class McpConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private vista(f: Fila): McpConnectionView {
    return {
      id: f.id,
      clientId: f.clientId,
      clientName: f.clientName,
      allowedOrgIds: f.allowedOrgIds,
      activeOrgId: f.activeOrgId,
      lastUsedAt: f.lastUsedAt?.toISOString() ?? null,
      revokedAt: f.revokedAt?.toISOString() ?? null,
      createdAt: f.createdAt.toISOString(),
    };
  }

  /**
   * ¿Qué cuenta de Praxis es esta identidad de Kyloo?
   *
   * Por `kylooSub` si ya entró alguna vez con Kyloo; si no, por correo, **solo
   * si la cuenta ya confirmó su buzón** (misma regla que `loginWithKyloo`: una
   * sin confirmar podría ser de quien la reservó).
   *
   * No vincula nada: solo responde. Vincular es un acto del login.
   */
  async identificar(datos: { sub: string; email: string }): Promise<{ userId: string } | null> {
    const porSub = await this.prisma.credential.findUnique({
      where: { kylooSub: datos.sub },
      include: { user: { select: { id: true, status: true } } },
    });
    const credencial =
      porSub ??
      (await this.prisma.credential.findFirst({
        where: {
          email: { equals: datos.email, mode: 'insensitive' },
          emailVerifiedAt: { not: null },
          kylooSub: null,
        },
        include: { user: { select: { id: true, status: true } } },
      }));
    if (!credencial?.user || credencial.user.status !== 'ACTIVE') return null;
    return { userId: credencial.user.id };
  }

  /** Crea o actualiza la conexión de esa persona con ese cliente, y la reactiva si estaba revocada. */
  async guardar(datos: {
    userId: string;
    kylooSub: string;
    clientId: string;
    clientName: string;
    allowedOrgIds: string[];
    activeOrgId: string;
  }): Promise<McpConnectionView> {
    if (!datos.allowedOrgIds.includes(datos.activeOrgId)) {
      throw new RpcException({
        statusCode: 400,
        message: 'La organización activa tiene que estar entre las permitidas.',
      });
    }
    const campos = {
      clientName: datos.clientName.slice(0, 80),
      kylooSub: datos.kylooSub,
      allowedOrgIds: [...new Set(datos.allowedOrgIds)],
      activeOrgId: datos.activeOrgId,
      revokedAt: null,
    };
    const fila = await this.prisma.mcpConnection.upsert({
      where: { userId_clientId: { userId: datos.userId, clientId: datos.clientId } },
      create: { userId: datos.userId, clientId: datos.clientId, ...campos },
      update: campos,
    });
    return this.vista(fila);
  }

  /** Las de esta persona, vivas primero. Las abandonadas sin usar no se enseñan. */
  async listar(userId: string): Promise<McpConnectionView[]> {
    const corte = new Date(Date.now() - SIN_USO_MS);
    const filas = await this.prisma.mcpConnection.findMany({
      where: {
        userId,
        OR: [{ lastUsedAt: { not: null } }, { createdAt: { gt: corte } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return filas.map((f) => this.vista(f));
  }

  /**
   * Cambia las organizaciones o la activa. Solo las propias: la ajena responde
   * 404 igual que una que no existe.
   */
  async actualizar(
    userId: string,
    id: string,
    cambios: { allowedOrgIds?: string[]; activeOrgId?: string },
  ): Promise<McpConnectionView> {
    const fila = await this.prisma.mcpConnection.findFirst({ where: { id, userId } });
    if (!fila || fila.revokedAt) {
      throw new RpcException({ statusCode: 404, message: 'Esa conexión no existe.' });
    }
    const allowedOrgIds = cambios.allowedOrgIds
      ? [...new Set(cambios.allowedOrgIds)]
      : fila.allowedOrgIds;
    let activeOrgId = cambios.activeOrgId ?? fila.activeOrgId;
    if (!allowedOrgIds.includes(activeOrgId)) {
      /* Quitar la activa de las permitidas deja la primera que quede, en vez de
         una conexión sin organización o un error por algo que la persona no vio. */
      if (cambios.activeOrgId) {
        throw new RpcException({
          statusCode: 400,
          message: 'Esa organización no está entre las que esta conexión puede usar.',
        });
      }
      activeOrgId = allowedOrgIds[0] as string;
    }
    const actualizada = await this.prisma.mcpConnection.update({
      where: { id },
      data: { allowedOrgIds, activeOrgId },
    });
    return this.vista(actualizada);
  }

  async revocar(userId: string, id: string): Promise<McpConnectionView> {
    const fila = await this.prisma.mcpConnection.findFirst({ where: { id, userId } });
    if (!fila) throw new RpcException({ statusCode: 404, message: 'Esa conexión no existe.' });
    const revocada = await this.prisma.mcpConnection.update({
      where: { id },
      data: { revokedAt: fila.revokedAt ?? new Date() },
    });
    return this.vista(revocada);
  }

  /**
   * Abre la sesión de una llamada del MCP con un token OAuth (equivale a
   * `pat_exchange`).
   *
   * Responde siempre **el mismo 401** si no vale, sea cual sea el motivo. Y se
   * exige que el `sub` del token sea el de la conexión: sin eso, quien tuviera
   * un token de Kyloo para otro cliente, o de otra persona, podría presentarlo
   * con el id de una conexión ajena.
   */
  async sesion(datos: { connectionId: string; sub: string }): Promise<ExchangedMcpConnection> {
    const noVale = () =>
      new RpcException({ statusCode: 401, message: 'La conexión no vale o fue revocada.' });

    const fila = await this.prisma.mcpConnection.findUnique({
      where: { id: datos.connectionId },
      include: { user: { select: { status: true } } },
    });
    if (!fila || fila.revokedAt || fila.kylooSub !== datos.sub || fila.user.status !== 'ACTIVE') {
      throw noVale();
    }

    const ahora = new Date();
    if (!fila.lastUsedAt || ahora.getTime() - fila.lastUsedAt.getTime() > LAST_USED_GRANO_MS) {
      await this.prisma.mcpConnection
        .update({ where: { id: fila.id }, data: { lastUsedAt: ahora } })
        .catch(() => undefined);
    }

    const accessToken = await this.jwt.signAsync(
      { sub: fila.userId, typ: TOKEN_ACCESO },
      { expiresIn: VIDA_DEL_ACCESO },
    );
    return {
      connectionId: fila.id,
      userId: fila.userId,
      activeOrgId: fila.activeOrgId,
      allowedOrgIds: fila.allowedOrgIds,
      clientName: fila.clientName,
      accessToken,
    };
  }

  /** Revoca todas las de una persona. Lo llama el cambio de contraseña (I4). */
  async revocarTodas(userId: string): Promise<void> {
    await this.prisma.mcpConnection.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
