import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ObservabilityModule } from '@praxis/observability'
import * as Joi from 'joi';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './entities/user.entity';

@Module({
    imports: [
        ObservabilityModule,
        ConfigModule.forRoot({
        isGlobal: true,
        validationSchema: Joi.object({
            DATABASE_URL: Joi.string().required(),
            DB_SCHEMA: Joi.string().required(),
            TCP_PORT: Joi.number().default(3001),
            LOG_LEVEL: Joi.string()
                .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                .default('info'),
        }),
        }),

        TypeOrmModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
            type: 'postgres',
            url: config.get('DATABASE_URL'),
            schema: config.get('DB_SCHEMA'),
            entities: [User],
            synchronize: true, // TODO: aguas que aca es solo pa desarrollo
        }),
        }),

        TypeOrmModule.forFeature([User]),
    ],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
