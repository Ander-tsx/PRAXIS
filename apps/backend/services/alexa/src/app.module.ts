import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { AlexaAuthModule } from './alexa-auth/alexa-auth.module';
import { ClientsProxyModule } from './clients/clients.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { VoiceAnalyticsModule } from './voice-analytics/voice-analytics.module';
import { VoiceProjectsModule } from './voice-projects/voice-projects.module';
import { VoiceTeamModule } from './voice-team/voice-team.module';

@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        TCP_PORT: Joi.number().required(),

        // Token de voz — secreto propio, scope de solo lectura
        VOICE_JWT_SECRET: Joi.string().optional(),
        VOICE_TOKEN_EXPIRES_IN: Joi.string().default('90d'),
        ALEXA_SESSION_TTL_DAYS: Joi.number().default(90),

        // Vinculación por frase semilla
        VOICE_SEED_PHRASE_WORDS: Joi.number().min(3).max(8).default(5),
        VOICE_SEED_PHRASE_TTL_SECONDS: Joi.number().default(300),
        /* Por aparato. Evita que un dispositivo mal configurado insista; no es
           una defensa, porque quien llama elige ese identificador. */
        VOICE_REDEEM_MAX_ATTEMPTS: Joi.number().default(5),
        /* Por IP, que la inyecta el gateway. Este es el que de verdad limita.
           Va más holgado: una casa o una oficina son una sola IP con varios
           aparatos legítimos detrás. */
        VOICE_REDEEM_MAX_ATTEMPTS_PER_IP: Joi.number().default(30),
        VOICE_REDEEM_WINDOW_SECONDS: Joi.number().default(600),

        // Convenciones de estado de tarea
        VOICE_COMPLETED_STATUSES: Joi.string().default(
          'done,completed,complete,completada,completado,finalizada,finalizado,terminada,terminado,hecho,hecha',
        ),
        VOICE_IN_PROGRESS_STATUSES: Joi.string().default(
          'in_progress,in progress,doing,en progreso,en curso,progreso',
        ),
        VOICE_BLOCKED_STATUSES: Joi.string().default(
          'blocked,bloqueada,bloqueado,blocker,impedimento,on hold,en espera',
        ),

        VOICE_STALE_DAYS: Joi.number().min(1).default(7),
        VOICE_FORECAST_WEEKS: Joi.number().min(1).max(12).default(4),
        VOICE_WEEK_MODE: Joi.string().valid('calendar', 'rolling').default('calendar'),

        // Servicios origen de los datos
        CREDENTIALS_SERVICE_HOST: Joi.string().default('localhost'),
        CREDENTIALS_SERVICE_PORT: Joi.number().default(3001),
        PROJECTS_SERVICE_HOST: Joi.string().default('localhost'),
        PROJECTS_SERVICE_PORT: Joi.number().default(3003),
        TASKS_SERVICE_HOST: Joi.string().default('localhost'),
        TASKS_SERVICE_PORT: Joi.number().default(3004),

        LOG_LEVEL: Joi.string()
          .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
          .default('info'),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
      }),
    }),
    PrismaModule,
    RedisModule,
    ClientsProxyModule,
    AlexaAuthModule,
    VoiceProjectsModule,
    VoiceAnalyticsModule,
    VoiceTeamModule,
  ],
})
export class AppModule {}
