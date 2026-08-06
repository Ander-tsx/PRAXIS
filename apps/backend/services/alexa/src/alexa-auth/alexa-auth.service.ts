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

/**
 * Un contador de intentos fallidos y su tope.
 *
 * Cada canje comprueba dos: el del aparato —que quien llama elige, así que no
 * defiende de nadie— y el de la IP, que inyecta el gateway y es el que cuenta.
 */
interface Contador {
  clave: string;
  max: number;
}

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

  /**
   * La skill envía lo que el usuario dictó; la frase es de un solo uso.
   *
   * ## Dos contadores, y el que importa es el segundo
   *
   * El primero va por aparato (`alexaUserId` + `deviceId`) y evita que un
   * dispositivo mal configurado se quede repitiendo una frase que no vale. **No
   * es una defensa**: los dos campos llegan en el cuerpo de una ruta pública, así
   * que quien quiera saltárselo solo tiene que cambiarlos en cada intento. Se
   * comprobó: doce peticiones rotando `alexaUserId` no producían ni un 429.
   *
   * El segundo va por **IP**, que la inyecta el gateway y quien llama no elige.
   * Ese es el que limita de verdad. Va más holgado porque una IP puede tener
   * detrás varios aparatos legítimos —una casa, una oficina— y el objetivo no es
   * cerrarle la puerta a nadie, sino que probar frases a ciegas cueste.
   *
   * Si no llega IP —una llamada directa por TCP, que hoy no ocurre desde fuera—
   * queda solo el primero. Se registra, porque es la señal de que alguien está
   * hablando con el microservicio sin pasar por el gateway.
   *
   * ## Lo que se cuenta son los **fallos**
   *
   * Un canje que sale bien no gasta presupuesto. Contar todos los intentos medía
   * la cosa equivocada: una casa que vincula tres aparatos seguidos gastaba lo
   * mismo que quien prueba frases a ciegas, y quien acierta a la primera se
   * quedaba a un intento del bloqueo **por haber acertado**. Lo que hay que
   * encarecer es equivocarse, que es lo único que produce la fuerza bruta.
   *
   * Se vio en la propia suite: `12-voz` canjea frases **válidas** una detrás de
   * otra y diez pruebas empezaron a fallar con 429 en cuanto el contador por IP
   * entró en juego. El número no era el problema; lo era qué se contaba.
   */
  async redeemSeedPhrase(dto: RedeemSeedPhraseDto) {
    const claves = [
      {
        clave: `alexa:redeem:attempts:${dto.alexaUserId}:${dto.deviceId ?? 'default'}`,
        max: this.config.get<number>('VOICE_REDEEM_MAX_ATTEMPTS', 5),
      },
    ];

    if (dto.clientIp) {
      claves.push({
        clave: `alexa:redeem:ip:${dto.clientIp}`,
        max: this.config.get<number>('VOICE_REDEEM_MAX_ATTEMPTS_PER_IP', 30),
      });
    } else {
      this.logger.warn(
        'Canje de frase sin IP de origen: solo se aplicó el límite por dispositivo, ' +
          'que quien llama controla. ¿Alguien está hablando con el servicio sin pasar por el gateway?',
      );
    }

    await this.exigirPresupuesto(claves);

    /* A partir de aquí, todo lo que lance es un fallo del canje y lo anota. El
       `try` envuelve el resto entero a propósito: si mañana se añade otro motivo
       de rechazo, entra en la cuenta sin que nadie tenga que acordarse. */
    try {
      return await this.canjear(dto);
    } catch (error) {
      await this.anotarFallo(claves);
      throw error;
    }
  }

  /** El canje propiamente dicho, sin la contabilidad de intentos. */
  private async canjear(dto: RedeemSeedPhraseDto) {
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

  /**
   * ¿Queda presupuesto en todos los contadores?
   *
   * **Solo lee.** Quien anota es `anotarFallo`, y únicamente cuando el canje ha
   * fallado de verdad: separar las dos cosas es lo que hace que acertar no
   * cueste. Mientras estuvieron juntas, el contador medía «peticiones» en vez de
   * «errores» y castigaba igual a quien vincula tres aparatos que a quien prueba
   * frases al azar.
   */
  private async exigirPresupuesto(contadores: Contador[]): Promise<void> {
    for (const { clave, max } of contadores) {
      const fallos = (await this.redis.get<number>(clave)) ?? 0;
      if (fallos >= max) {
        throw new RpcException({
          statusCode: 429,
          message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
        });
      }
    }
  }

  /**
   * Anota un intento fallido en todos los contadores.
   *
   * La ventana se renueva en cada fallo, así que es deslizante: insistir no
   * acerca el momento en que vuelve a abrirse, lo aleja. Es lo que se quiere de
   * un límite contra la fuerza bruta.
   *
   * No propaga: quedarse sin anotar un fallo es un contador que va corto; lanzar
   * desde aquí convertiría un problema de Redis en un error de canje para alguien
   * que quizá dictó bien la frase.
   */
  private async anotarFallo(contadores: Contador[]): Promise<void> {
    const windowSeconds = this.config.get<number>('VOICE_REDEEM_WINDOW_SECONDS', 600);

    for (const { clave } of contadores) {
      try {
        const fallos = (await this.redis.get<number>(clave)) ?? 0;
        await this.redis.set(clave, fallos + 1, windowSeconds);
      } catch (error) {
        this.logger.warn(`No se pudo anotar el intento fallido en ${clave}: ${error}`);
      }
    }
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
