import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@praxis/observability';
import { PermissionsModule } from './permissions.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PermissionsModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: Number.parseInt(process.env.TCP_PORT ?? '3003'),
      },
      bufferLogs: true,
    },
  );

  app.useLogger(app.get(Logger));

  await app.listen();
  app
    .get(Logger)
    .log(
      `Servicio permissions corriendo en el puerto tcp ${process.env.TCP_PORT ?? '3003'}`,
    );
}
bootstrap();
