import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards';
import { MinioService } from '../storage/minio.service';

@Controller('assets')
export class UploadsController {
  constructor(private readonly minio: MinioService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File): Promise<{ url: string; key: string; mimeType: string; size: number }> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }

    return this.minio.uploadFile(file, 'posts');
  }
}
