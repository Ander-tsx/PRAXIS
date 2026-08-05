import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { RedisModule } from './redis/redis.module';
import { ReportsModule } from './reports/reports.module';

/**
 * El quinto microservicio, y el único **sin base de datos propia**.
 *
 * No tiene `PrismaModule` ni `DATABASE_URL`, y no es un olvido: `reports` no
 * guarda nada. Lee de tasks-service y projects-service por TCP, hace la
 * matemática y devuelve el resultado. Darle un esquema vacío en Postgres habría
 * añadido una migración que no migra nada y una entrada en `prisma:reset` que
 * nunca haría falta.
 *
 * Lo único que persiste es la **caché** de resultados en Redis, que es
 * desechable por definición.
 */
@Module({
  imports: [
    ObservabilityModule.forRoot({ serviceName: 'reports' }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        REDIS_URL:              Joi.string().default('redis://localhost:6379'),
        TCP_PORT:               Joi.number().required(),
        /* Los dos servicios de los que lee. Sin ellos no puede responder nada,
           así que se validan al arrancar en vez de fallar en la primera
           petición. */
        TASKS_SERVICE_HOST:     Joi.string().default('localhost'),
        TASKS_SERVICE_PORT:     Joi.number().default(3004),
        PROJECTS_SERVICE_HOST:  Joi.string().default('localhost'),
        PROJECTS_SERVICE_PORT:  Joi.number().default(3003),
        LOG_LEVEL:              Joi.string()
                                  .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                                  .default('info'),
        NODE_ENV:               Joi.string()
                                  .valid('development', 'production', 'test')
                                  .default('development'),
      }),
    }),
    RedisModule,
    ReportsModule,
  ],
})
export class AppModule {}
