import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type DomainOutboxPublishStats,
  DomainOutboxPublisher,
  type OutboxStore,
  type OutboxStream,
} from '@praxis/domain-events';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type { DomainOutboxPublishStats };

/**
 * El publicador de este servicio.
 *
 * ⚠️ **La lógica ya no está aquí, y es lo que se quería.** Este archivo tenía
 * ciento ochenta y seis líneas idénticas —byte a byte— a las del otro servicio,
 * salvo el nombre de la clase. Dos copias del patrón que sostiene la entrega de
 * hechos es la garantía de que un arreglo entre en una y no en la otra. Vive en
 * `@praxis/domain-events`, con las pruebas en un solo sitio.
 */
@Injectable()
export class ProjectDomainOutboxPublisher extends DomainOutboxPublisher {
  constructor(prisma: PrismaService, redis: RedisService, config: ConfigService) {
    super(
      prisma as unknown as OutboxStore,
      redis as unknown as OutboxStream,
      config,
      'ProjectDomainOutboxPublisher',
    );
  }
}
