import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OrganizationsService } from './src/organizations/organizations.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(OrganizationsService);
  
  console.log('Fetching plan...');
  const plan = await service.planEfectivoDe('11111111-1111-4111-8111-111111111111');
  console.log('Plan:', plan);
  
  await app.close();
}
bootstrap();
