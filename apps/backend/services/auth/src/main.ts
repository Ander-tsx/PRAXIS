import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: Number.parseInt(process.env.TCP_PORT ?? '3001'),
    },
  });

  await app.listen();
  console.log('Servicio auth corriendo en el puerto tcp ', process.env.TCP_PORT ?? '3001');
}
bootstrap();
