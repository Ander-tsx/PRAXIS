import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ObservabilityModule } from '@praxis/observability';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        TCP_PORT: Joi.number().required(),
        JWT_SECRET: Joi.string().required(),

        /* ID de cliente de Google. **Opcional a propósito**: sin él la entrada
           con contraseña funciona igual, así que el servicio debe arrancar y
           fallar solo en el camino de Google, con un 503 que dice qué falta.
           Es público —viaja en el JavaScript del navegador—, así que no es un
           secreto y no vive en Secret Manager. */
        GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),
        /**
         * ⚠️ **La unidad es obligatoria, y no es quisquillosidad.**
         *
         * `jsonwebtoken` pasa las cadenas por `ms()`, y ahí un número pelado
         * significa **milisegundos**. Un `.env` con
         * `REFRESH_TOKEN_EXPIRES_IN=50` —escrito pensando en cincuenta segundos
         * o cincuenta minutos— firma un token que caduca en 50 ms: nace con
         * `exp` igual a `iat` y muere antes de llegar al navegador.
         *
         * El fallo que produce no apunta a ninguna parte. Entrar funciona, y lo
         * que se rompe es la renovación: cada zona renueva en su `proxy.ts`, así
         * que la sesión se cae a los quince minutos y la única pista es un 401
         * en `/auth/refresh`. Así llegó a esta rama, y así aguantó hasta que la
         * suite lo cazó.
         *
         * Con el patrón, ese `.env` **no arranca el servicio** y el mensaje dice
         * qué variable es. Vale para las dos: `JWT_EXPIRES_IN` tiene el mismo
         * problema, solo que con síntomas aún más raros.
         */
        JWT_EXPIRES_IN: Joi.string()
          .pattern(/^\d+(ms|s|m|h|d|w|y)$/)
          .message('{{#label}} necesita unidad: 15m, 24h, 7d… (un número pelado son milisegundos)')
          .default('15m'),
        REFRESH_TOKEN_EXPIRES_IN: Joi.string()
          .pattern(/^\d+(ms|s|m|h|d|w|y)$/)
          .message('{{#label}} necesita unidad: 15m, 24h, 7d… (un número pelado son milisegundos)')
          .default('7d'),
        LOG_LEVEL: Joi.string()
          .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
          .default('info'),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
      }),
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
