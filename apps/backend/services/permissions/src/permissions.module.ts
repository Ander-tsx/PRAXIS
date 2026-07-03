import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@praxis/observability';
import * as Joi from 'joi';

import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
    imports: [
        ObservabilityModule,
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: Joi.object({
                TCP_PORT: Joi.number().default(3003),
                LOG_LEVEL: Joi.string()
                    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
                    .default('info'),
            }),
        }),
    ],
    controllers: [PermissionsController],
    providers: [PermissionsService],
})
export class PermissionsModule {}
