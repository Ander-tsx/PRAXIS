import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import * as crypto from 'node:crypto';

import {
  FindAlexaLinksDto,
  GenerateSeedPhraseDto,
  RedeemSeedPhraseDto,
  RevokeAlexaLinkDto,
  VerifyAlexaTokenDto,
} from '@praxis/contracts';

import { PraxisDataService } from '../clients/praxis-data.service';
import { displayName } from '../common/text.util';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { canonicalizePhrase, generateSeedPhrase } from './seed-phrase.util';

@Injectable()
export class AlexaAuthService {
  private readonly logger = new Logger(AlexaAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly data: PraxisDataService,
  ) {}

  private hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private generateToken(): string {
    return `v_tok_v1_${crypto.randomBytes(64).toString('base64url')}`;
  }

  private getSessionTtlDays(): number {
    return this.config.get<number>('ALEXA_SESSION_TTL_DAYS', 90);
  }

  // ─── Vinculación por frase semilla (Web App) ─────────────────────────────

  /** La app web llama a esta función con el JWT normal del usuario. */
  async generateSeedPhrase(dto: GenerateSeedPhraseDto) {
    const words = this.config.get<number>('VOICE_SEED_PHRASE_WORDS', 5);
    const ttl = this.config.get<number>('VOICE_SEED_PHRASE_TTL_SECONDS', 300);

    const now = new Date();
    // Invalidar frases previas no canjeadas del usuario
    await this.prisma.alexaLinkCode.updateMany({
      where: { userId: dto.userId, redeemedAt: null },
      data: { expiresAt: now },
    });

    const phrase = generateSeedPhrase(words);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.prisma.alexaLinkCode.create({
      data: {
        userId: dto.userId,
        phraseHash: this.hash(canonicalizePhrase(phrase)),
        expiresAt,
      },
    });

    this.logger.log(`Frase semilla generada para el usuario ${dto.userId}`);

    return {
      phrase,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: ttl,
    };
  }

  // ─── Canje de frase semilla (Alexa Skill) ─────────────────────────────────

  /** La skill envía lo que el usuario dictó; la frase es de un solo uso. */
  async redeemSeedPhrase(dto: RedeemSeedPhraseDto) {
    const rateLimitKey = `alexa:redeem:attempts:${dto.alexaUserId}:${dto.deviceId ?? 'default'}`;
    await this.assertRateLimit(rateLimitKey);

    const phraseHash = this.hash(canonicalizePhrase(dto.phrase));
    const record = await this.prisma.alexaLinkCode.findUnique({ where: { phraseHash } });

    if (!record) {
      this.logger.warn(`Frase semilla no reconocida desde ${dto.alexaUserId}`);
      throw new RpcException({ statusCode: 400, message: 'Frase no válida' });
    }

    if (record.redeemedAt) {
      throw new RpcException({ statusCode: 410, message: 'Esa frase ya fue utilizada' });
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new RpcException({ statusCode: 410, message: 'La frase de vinculación expiró' });
    }

    // Marca la semilla como canjeada inmediatamente
    await this.prisma.alexaLinkCode.update({
      where: { id: record.id },
      data: { redeemedAt: new Date() },
    });

    // Límite de una sesión activa por dispositivo: revocar previa si existía
    if (dto.alexaUserId) {
      await this.prisma.alexaSession.updateMany({
        where: {
          alexaUserId: dto.alexaUserId,
          revokedAt: null,
          ...(dto.deviceId ? { deviceId: dto.deviceId } : {}),
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 're-linked',
        },
      });
    }

    // Crear la nueva sesión opaca
    const token = this.generateToken();
    const tokenHash = this.hash(token);
    const ttlDays = this.getSessionTtlDays();
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.alexaSession.create({
      data: {
        userId: record.userId,
        voiceTokenHash: tokenHash,
        alexaUserId: dto.alexaUserId,
        deviceId: dto.deviceId ?? null,
        expiresAt,
      },
    });

    const profile = await this.data.getUser(record.userId);
    const userDisplayName = profile ? displayName(profile) : 'Usuario';

    this.logger.log(`Sesión de Alexa creada exitosamente para el usuario ${record.userId}`);

    return {
      voiceToken: token,
      user: {
        id: record.userId,
        displayName: userDisplayName,
      },
    };
  }

  // ─── Verificación del AlexaToken ──────────────────────────────────────────

  /**
   * Verifica la validez del token en cada solicitud de voz:
   * SHA256(token) -> ¿Existe? -> ¿Revocado? -> ¿Expiró? -> ¿Usuario activo?
   */
  async verifyToken(dto: VerifyAlexaTokenDto) {
    const tokenHash = this.hash(dto.token);

    const session = await this.prisma.alexaSession.findUnique({
      where: { voiceTokenHash: tokenHash },
    });

    if (!session) {
      throw new RpcException({ statusCode: 401, message: 'AlexaToken no válido o no existe' });
    }

    if (session.revokedAt) {
      throw new RpcException({ statusCode: 401, message: 'Sesión de Alexa revocada' });
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new RpcException({ statusCode: 401, message: 'Sesión de Alexa expirada' });
    }

    /**
     * Que el usuario siga existiendo **y activo**.
     *
     * ⚠️ Esto era `if (!profile)` con un comentario que decía «verificar que el
     * usuario siga activo». Comprobaba solo la **existencia**: una cuenta
     * suspendida devuelve perfil, pasaba el `if`, y su token de voz seguía
     * sirviendo hasta **90 días** (`VOICE_TOKEN_EXPIRES_IN`). Es el mismo fallo
     * que tenía `auth.service.refresh()`, pero con una ventana 8.600 veces más
     * larga y por el camino en el que nadie piensa en mirar.
     *
     * `getUsersByIds` ya declara `status`; hasta que lo declaró, quien quisiera
     * hacer esta comprobación no tenía a qué agarrarse.
     */
    const profile = await this.data.getUser(session.userId);
    if (!profile) {
      throw new RpcException({ statusCode: 401, message: 'El usuario ya no existe' });
    }

    if (profile.status && profile.status !== 'ACTIVE') {
      /* La sesión se revoca aquí también: si no, cada frase que dijera esa
         persona volvería a preguntar y a recibir el mismo 401. Suspender ya las
         revoca, pero este camino cubre el cambio de estado que no pase por ahí. */
      await this.prisma.alexaSession
        .update({ where: { id: session.id }, data: { revokedAt: new Date() } })
        .catch(() => undefined);

      throw new RpcException({ statusCode: 401, message: 'La cuenta está suspendida o inactiva' });
    }

    // Actualizar fecha del último uso de forma asíncrona (sin bloquear)
    void this.prisma.alexaSession
      .update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);

    return {
      userId: session.userId,
      linkId: session.id,
    };
  }

  // ─── Endpoint /me ─────────────────────────────────────────────────────────

  async getMe(params: { userId: string }) {
    const profile = await this.data.getUser(params.userId);
    if (!profile) {
      throw new RpcException({ statusCode: 404, message: 'Usuario no encontrado' });
    }

    return {
      id: params.userId,
      displayName: displayName(profile),
    };
  }

  // ─── Endpoint /logout ──────────────────────────────────────────────────────

  async logout(params: { token: string }) {
    const tokenHash = this.hash(params.token);
    const session = await this.prisma.alexaSession.findUnique({
      where: { voiceTokenHash: tokenHash },
    });

    if (session && !session.revokedAt) {
      await this.prisma.alexaSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          revokedReason: 'logout',
        },
      });
    }

    return {
      success: true,
      message: 'Sesión de voz cerrada correctamente',
    };
  }

  // ─── Gestión desde la Web App ─────────────────────────────────────────────

  async revokeLink(dto: RevokeAlexaLinkDto) {
    const where = dto.linkId
      ? { id: dto.linkId, userId: dto.userId, revokedAt: null }
      : { userId: dto.userId, revokedAt: null };

    const { count } = await this.prisma.alexaSession.updateMany({
      where,
      data: {
        revokedAt: new Date(),
        revokedReason: dto.reason ?? 'user_revoked',
      },
    });

    this.logger.log(`${count} sesión(es) de Alexa revocada(s) para el usuario ${dto.userId}`);
    return { success: true, revoked: count };
  }

  async findLinks(dto: FindAlexaLinksDto) {
    const links = await this.prisma.alexaSession.findMany({
      where: { userId: dto.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        alexaUserId: true,
        deviceId: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
      },
    });

    return links;
  }

  // ─── Rate Limiting ────────────────────────────────────────────────────────

  private async assertRateLimit(key: string): Promise<void> {
    const max = this.config.get<number>('VOICE_REDEEM_MAX_ATTEMPTS', 5);
    const windowSeconds = this.config.get<number>('VOICE_REDEEM_WINDOW_SECONDS', 600);

    const attempts = (await this.redis.get<number>(key)) ?? 0;
    if (attempts >= max) {
      throw new RpcException({
        statusCode: 429,
        message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
      });
    }

    await this.redis.set(key, attempts + 1, windowSeconds);
  }

  // ─── Auditoría ────────────────────────────────────────────────────────────

  /** Registro de consulta de voz. No debe bloquear ni romper la respuesta. */
  logQuery(params: {
    userId: string;
    queryType: string;
    projectId?: string | null;
    linkId?: string | null;
    success?: boolean;
  }): void {
    void this.prisma.voiceQueryLog
      .create({
        data: {
          userId: params.userId,
          linkId: params.linkId ?? null,
          projectId: params.projectId ?? null,
          queryType: params.queryType,
          success: params.success ?? true,
        },
      })
      .catch((error) =>
        this.logger.warn(`No se pudo registrar la consulta de voz: ${error.message}`),
      );
  }
}

