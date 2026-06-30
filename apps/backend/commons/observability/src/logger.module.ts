import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { pinoConfig } from './pino.config';

@Global()
@Module({
  imports: [LoggerModule.forRoot(pinoConfig)],
  exports: [LoggerModule],
})
export class ObservabilityModule {}