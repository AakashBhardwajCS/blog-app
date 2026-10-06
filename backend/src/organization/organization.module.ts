import { Module } from '@nestjs/common';
import { InvitesController, OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Module({
  controllers: [OrganizationController, InvitesController],
  providers: [OrganizationService],
})
export class OrganizationModule {}
