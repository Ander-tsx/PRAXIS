import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OrganizationsService } from './src/organizations/organizations.service';
import { PlanTier } from '@praxis/contracts';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(OrganizationsService);
  
  console.log('Creating org...');
  try {
    const org = await service.crear({
      ownerUserId: '11111111-1111-4111-8111-111111111111',
      ownerEmail: 'admin@praxis.dev',
      name: 'Test Create Org',
      tier: PlanTier.FREE,
      seats: 3
    });
    console.log('Org:', org);
  } catch (e) {
    console.error('Error:', e);
  }
  
  await app.close();
}
bootstrap();
