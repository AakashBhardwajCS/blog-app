import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [UploadsModule], // provides SeaweedService for avatar storage
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
