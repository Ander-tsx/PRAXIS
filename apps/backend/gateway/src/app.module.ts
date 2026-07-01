import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ObservabilityModule } from '@praxis/observability';
import { AuthModule } from './auth/auth.module';
import { envValidationSchema } from './common/config/env.validation';

@Module({
  imports: [
    ObservabilityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    //TODO: Modulos de negocio
    AuthModule,
  ],
})
export class AppModule {}
