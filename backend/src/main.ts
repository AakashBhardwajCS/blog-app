import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const productionOrigins = (process.env.FRONTEND_URL ?? '').split(',').filter(Boolean);

  app.enableCors({
    // Reflect local origins during development. In production, only use the explicit allow-list.
    origin: process.env.NODE_ENV === 'production' ? productionOrigins : true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.listen(Number(process.env.PORT ?? 3001));
}
void bootstrap();
