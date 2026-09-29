import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class SeaweedService implements OnModuleInit {
  private readonly logger = new Logger(SeaweedService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('SEAWEED_ENDPOINT') ?? 'localhost';
    const port = Number(this.config.get<string>('SEAWEED_PORT') ?? '8333');
    const useSsl = (this.config.get<string>('SEAWEED_USE_SSL') ?? 'false').toLowerCase() === 'true';

    this.publicBaseUrl = (this.config.get<string>('SEAWEED_PUBLIC_URL') ?? `${useSsl ? 'https' : 'http'}://${endpoint}:${port}`).replace(/\/$/, '');
    this.bucket = this.config.get<string>('SEAWEED_BUCKET') ?? 'blog-assets';

    this.client = new S3Client({
      region: this.config.get<string>('SEAWEED_REGION') ?? 'us-east-1',
      endpoint: `${useSsl ? 'https' : 'http'}://${endpoint}:${port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get<string>('SEAWEED_ACCESS_KEY') ?? 'someAccessKey',
        secretAccessKey: this.config.get<string>('SEAWEED_SECRET_KEY') ?? 'someSecretKey',
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created SeaweedFS bucket: ${this.bucket}`);
    }
  }

  async uploadFile(file: Express.Multer.File, folder = 'posts'): Promise<{ url: string; key: string; mimeType: string; size: number }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    await this.ensureBucket();

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
        ACL: 'public-read',
      }),
    );

    return {
      url: `${this.publicBaseUrl}/${this.bucket}/${key}`,
      key,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
    };
  }
}
