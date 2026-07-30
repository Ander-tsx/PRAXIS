import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { AssistantModule } from './assistant/assistant.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * El sexto microservicio.
 *
 * Existe por **la cuota**, no por la IA: un contador mensual que gobierna un
 * coste real necesita estado, y el plan de cada usuario es un dato suyo, no un
 * contador desechable. Con eso ya hay tabla, y con tabla ya hay servicio.
 *
 * Lo que **no** hace: no consulta tareas ni proyectos —el contexto se lo arma
 * `reports-service`— y no ejecuta ninguna acción. Devuelve propuestas.
 */
@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL:          Joi.string().required(),
        TCP_PORT:              Joi.number().required(),
        /* De aquí sale el contexto. Sin él no hay nada que contarle al modelo,
           así que se valida al arrancar en vez de fallar en la primera
           petición. */
        REPORTS_SERVICE_HOST:  Joi.string().default('localhost'),
        REPORTS_SERVICE_PORT:  Joi.number().default(3005),
        /**
         * ⚠️ **Requerida, y a propósito.** Sin clave este servicio no puede
         * hacer lo único que hace, y arrancar igual solo cambia el momento del
         * fallo: en vez de no levantar, respondería 500 a la primera pregunta
         * de alguien. Mejor que no arranque y se vea al montar el entorno.
         */
        GEMINI_API_KEY:        Joi.string().required(),
        GEMINI_MODEL:          Joi.string().default('gemini-flash-latest'),
        LOG_LEVEL:             Joi.string()
                                 .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                                 .default('info'),
        NODE_ENV:              Joi.string()
                                 .valid('development', 'production', 'test')
                                 .default('development'),
      }),
    }),
    PrismaModule,
    AssistantModule,
  ],
})
export class AppModule {}
