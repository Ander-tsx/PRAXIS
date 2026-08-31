import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { MyOrganizationsController } from './src/billing/organizations.controller';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const controller = app.get(MyOrganizationsController);
  console.log('Testing TCP...');
  try {
    const res = await controller.mias({ user: { userId: '11111111-1111-4111-8111-111111111111' } } as any);
    console.log('Response:', res);
  } catch(e) {
    console.error('Error:', e);
  }
  await app.close();
}
bootstrap();
