import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { SeaweedService } from '../storage/seaweed.service';

@Module({
  controllers: [UploadsController],
  providers: [SeaweedService],
  exports: [SeaweedService],
})
export class UploadsModule {}
