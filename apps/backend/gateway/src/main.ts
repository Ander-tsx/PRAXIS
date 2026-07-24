import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@praxis/observability';
import { AppModule } from './app.module';
import { StandardExceptionFilter } from './common/filters/standard-exception.filter';
import { StandardResponseInterceptor } from './common/interceptors/standard-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const port = config.get<number>('HTTP_PORT') ?? 3000;

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

  await app.listen(port);
  app.get(Logger).log(`Gateway running on http://localhost:${port}/api`);
}
bootstrap();
