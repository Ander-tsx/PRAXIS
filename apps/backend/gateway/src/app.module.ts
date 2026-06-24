import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { envValidationSchema } from './common/config/env.validation';
import { AuthModule } from './auth/auth.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validationSchema: envValidationSchema,
		}),

		ThrottlerModule.forRoot([
			{
				ttl: 60_000,
				limit: 100,
			}
		]),

		//TODO: Modulos de negocio
		AuthModule,
	]
})
export class AppModule {}