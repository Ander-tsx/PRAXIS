import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@praxis/observability';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { StandardExceptionFilter } from './common/filters/standard-exception.filter';
import { StandardResponseInterceptor } from './common/interceptors/standard-response.interceptor';
import { montarProxyDeCollab } from './collab-proxy';

async function bootstrap() {
  /**
   * `rawBody: true` guarda el cuerpo **sin parsear** en `req.rawBody`.
   *
   * ⚠️ Lo exige la firma del webhook de Stripe, y es la trampa clásica de esta
   * integración: la firma se calcula sobre los bytes exactos que se enviaron, y
   * el parser de JSON de Express los reconstruye —reordena claves, cambia el
   * espaciado—, así que verificar contra `req.body` re-serializado falla
   * **siempre**, con un error que solo dice «firma inválida» y no por qué.
   *
   * No cambia nada para el resto de rutas: `req.body` sigue llegando parseado
   * como hasta ahora; esto solo añade una copia de los bytes originales.
   */
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

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

  /**
   * `'0.0.0.0'` explícito, no el `localhost` por defecto de Nest.
   *
   * En local da igual, pero en un contenedor el sondeo de salud de la
   * plataforma (Railway) entra por la interfaz de red, no por el loopback: con
   * el bind por defecto la conexión se rechaza y el despliegue falla en
   * «Healthcheck failure» con el gateway perfectamente arrancado por dentro.
   */
  await app.listen(port, '0.0.0.0');
  /* El tiempo real de los documentos sale por este mismo puerto (ver
     `collab-proxy.ts`): Railway solo publica uno por servicio. */
  montarProxyDeCollab(
    app.getHttpServer(),
    process.env.COLLAB_SERVICE_HOST ?? '127.0.0.1',
    Number(process.env.COLLAB_SERVICE_PORT ?? 3010),
  );
  app.get(Logger).log(`Gateway running on http://0.0.0.0:${port}/api`);

  if (!esProduccion) {
    app.get(Logger).log(`Swagger docs available at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
