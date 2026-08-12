import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { correoDeRecuperacion, correoDeVerificacion } from '../mail/plantillas';

type TipoDeToken = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

/** Cuánto vive cada tipo de enlace. */
const VIGENCIA_MS: Record<TipoDeToken, number> = {
  /* Un día: quien se registra puede tardar en abrir el correo, y reenviarlo es
     gratis. */
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  /* Media hora. Un enlace que cambia una contraseña es una llave: cuanto menos
     tiempo esté viva en una bandeja de entrada, mejor. */
  PASSWORD_RESET: 30 * 60 * 1000,
};

/**
 * Los tokens de un solo uso que viajan por correo.
 *
 * ## El token nunca se guarda
 *
 * Se genera al azar, se manda en el enlace y en la base solo queda su SHA-256.
 * Es el mismo criterio que con las contraseñas: quien lea esta tabla no puede
 * usar lo que ve. Buscar por hash sigue siendo una consulta por índice único, así
 * que no se paga nada por ello.
 *
 * ⚠️ **SHA-256 y no bcrypt, y aquí sí es correcto.** Una contraseña se hashea
 * con un algoritmo lento porque la elige una persona y se puede adivinar; esto
 * son 32 bytes de `randomBytes`, que no se adivinan por fuerza bruta ni con todo
 * el tiempo del mundo. Un algoritmo lento aquí solo serviría para que buscar el
 * token fuera lento —habría que comparar contra cada fila en vez de mirar el
 * índice—.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** La base pública, para construir los enlaces del correo. */
  private get sitio(): string {
    return this.config.get<string>('APP_URL') ?? 'http://localhost:4100';
  }

  /**
   * Emite un token y **invalida los anteriores del mismo tipo**.
   *
   * Lo segundo importa: sin ello, pedir tres veces «reenviar» dejaría tres
   * enlaces vivos, y el primero seguiría sirviendo horas después de que la
   * persona creyera haberlo sustituido.
   */
  private async emitir(credentialId: string, type: TipoDeToken): Promise<string> {
    await this.prisma.authToken.updateMany({
      where: { credentialId, type, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('base64url');

    await this.prisma.authToken.create({
      data: {
        credentialId,
        type,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + VIGENCIA_MS[type]),
      },
    });

    return token;
  }

  /**
   * Canjea un token: comprueba que exista, no esté usado y no haya caducado.
   *
   * Devuelve el `credentialId` o `null`. **No distingue los tres motivos hacia
   * fuera** —quien llama solo sabe si vale o no— porque desde la pantalla no hay
   * nada distinto que hacer con cada uno: el remedio siempre es pedir otro
   * enlace.
   *
   * Marca `usedAt` en la misma consulta que comprueba, con `updateMany` sobre
   * las condiciones: así dos pulsaciones seguidas del mismo enlace no lo canjean
   * dos veces. La segunda no encuentra fila que actualizar.
   */
  async canjear(token: string, type: TipoDeToken): Promise<string | null> {
    const tokenHash = this.hash(token);

    const fila = await this.prisma.authToken.findUnique({ where: { tokenHash } });
    if (!fila || fila.type !== type || fila.usedAt || fila.expiresAt < new Date()) {
      return null;
    }

    const { count } = await this.prisma.authToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    return count === 1 ? fila.credentialId : null;
  }

  /** Manda el correo de confirmación de una cuenta recién creada. */
  async enviarVerificacion(credentialId: string, email: string): Promise<void> {
    const token = await this.emitir(credentialId, 'EMAIL_VERIFICATION');
    const enlace = `${this.sitio}/auth/verificar?token=${token}`;
    const horas = VIGENCIA_MS.EMAIL_VERIFICATION / 3_600_000;

    const { asunto, html, texto } = correoDeVerificacion(enlace, horas);
    await this.mail.enviar(email, asunto, html, texto);
  }

  /** Manda el correo para elegir contraseña nueva. */
  async enviarRecuperacion(credentialId: string, email: string): Promise<void> {
    const token = await this.emitir(credentialId, 'PASSWORD_RESET');
    const enlace = `${this.sitio}/auth/restablecer?token=${token}`;
    const minutos = VIGENCIA_MS.PASSWORD_RESET / 60_000;

    const { asunto, html, texto } = correoDeRecuperacion(enlace, minutos);
    await this.mail.enviar(email, asunto, html, texto);
  }
}
