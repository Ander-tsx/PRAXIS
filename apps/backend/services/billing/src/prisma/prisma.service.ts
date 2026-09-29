import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma-client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        /* En el monolito todos los servicios comparten `process.env`, y un solo
           `DATABASE_URL` los mandaría a todos al mismo schema. Ver
           docs/PLAN-MONOLITO.md, M4. */
        connectionString:
          config.get<string>('BILLING_DATABASE_URL') ?? config.getOrThrow<string>('DATABASE_URL'),
        /* Sin `max`, `pg-pool` abre hasta 10 conexiones; los demás servicios
           ya se limitaban a cinco. El porqué, en el PrismaService de projects. */
        max: Number(config.get<string>('DATABASE_POOL_MAX') ?? 5),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
