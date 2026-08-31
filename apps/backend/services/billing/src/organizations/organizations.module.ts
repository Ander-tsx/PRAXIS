import { Module } from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, SubscriptionsService],
  exports: [OrganizationsService, SubscriptionsService],
})
export class OrganizationsModule {}
