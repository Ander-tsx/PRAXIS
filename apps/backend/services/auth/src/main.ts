import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@praxis/observability';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: Number.parseInt(process.env.TCP_PORT ?? '3001'),
    },
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  await app.listen();
  app.get(Logger).log(`Servicio auth corriendo en el puerto tcp ${process.env.TCP_PORT ?? '3001'}`);
}
bootstrap();
