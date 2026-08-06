import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Job periódico que purga sesiones y frases semilla expiradas o revocadas */
@Injectable()
export class CleanupAlexaAuthJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupAlexaAuthJob.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Ejecutar inmediatamente al arrancar y luego cada 24 horas (86400000 ms)
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), 86400000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async cleanup(): Promise<void> {
    try {
      const now = new Date();

      const deletedSessions = await this.prisma.alexaSession.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
        },
      });

      const deletedCodes = await this.prisma.alexaLinkCode.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { redeemedAt: { not: null } }],
        },
      });

      if (deletedSessions.count > 0 || deletedCodes.count > 0) {
        this.logger.log(
          `Mantenimiento de Alexa Auth: purgadas ${deletedSessions.count} sesiones y ${deletedCodes.count} semillas expiradas/revocadas`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Error durante la limpieza periódica de Alexa Auth: ${(error as Error).message}`,
      );
    }
  }
}
