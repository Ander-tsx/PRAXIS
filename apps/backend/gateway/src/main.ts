import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@praxis/observability';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { StandardExceptionFilter } from './common/filters/standard-exception.filter';
import { StandardResponseInterceptor } from './common/interceptors/standard-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const port = config.get<number>('HTTP_PORT') ?? 3000;
  const esProduccion = config.get<string>('NODE_ENV') === 'production';

  /**
   * Cabeceras de seguridad.
   *
   * Hoy el navegador no habla directo con el gateway —toda petición cruza el
   * proxy de su zona— así que el efecto es acotado, pero no nulo: la descarga
   * de adjuntos (`attachments.controller.ts`) devuelve bytes que subió un
   * usuario, y hasta ahora dependía de que su propio `nosniff` estuviera puesto
   * a mano en ese controlador. Aquí queda por defecto para todo.
   *
   * `contentSecurityPolicy` se desactiva porque este servicio no sirve HTML: la
   * CSP por defecto de helmet rompe la interfaz de Swagger sin proteger nada que
   * no cubra ya `nosniff`.
   */
  app.use(helmet({ contentSecurityPolicy: false }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new StandardResponseInterceptor());
  app.useGlobalFilters(new StandardExceptionFilter());

  app.setGlobalPrefix('api');

  /**
   * Swagger, solo fuera de producción.
   *
   * Se montaba siempre, y ahí publica los 28 endpoints con sus DTOs y su forma
   * exacta a cualquiera que alcance el puerto. Es un mapa del sistema regalado:
   * no abre ninguna puerta por sí mismo, pero ahorra todo el trabajo de
   * averiguar cuáles hay y qué esperan.
   *
   * En desarrollo sigue igual — es donde se usa de verdad.
   */
  if (!esProduccion) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PRAXIS API Gateway')
      .setDescription('Documentación de la API pública de la plataforma PRAXIS')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, documentFactory);
  }

  await app.listen(port);
  app.get(Logger).log(`Gateway running on http://localhost:${port}/api`);

  if (!esProduccion) {
    app.get(Logger).log(`Swagger docs available at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
