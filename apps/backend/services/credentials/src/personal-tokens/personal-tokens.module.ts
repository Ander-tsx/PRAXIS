import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PersonalTokensController } from './personal-tokens.controller';
import { PersonalTokensService } from './personal-tokens.service';

@Module({
  imports: [
    /* Mismo secreto que `AuthModule`: el JWT del canje lo verifica el
       `JwtGuard` del gateway como cualquier otro token de acceso. */
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [PersonalTokensController],
  providers: [PersonalTokensService],
  exports: [PersonalTokensService],
})
export class PersonalTokensModule {}
