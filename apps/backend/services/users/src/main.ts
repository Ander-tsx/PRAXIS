import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { UserModule } from './user.module';

async function bootstrap() {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(UserModule, {
        transport: Transport.TCP,
        options: {
            host: '0.0.0.0',
            port: Number.parseInt(process.env.TCP_PORT ?? '3002')
        }
    });

    await app.listen();
    console.log('Servicio user corriendo en el puerto tcp ', process.env.TCP_PORT ?? '3002');
}
bootstrap();
