import { Logger, ValidationPipe } from '@nestjs/common';
// Creates the nestjs application instance
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// startup function of the server
async function bootstrap(): Promise<void> {

  const logger = new Logger('Bootstrap');
  
  // this creates the application instance
  const app = await NestFactory.create(AppModule);

  // used to route route all requests with a specific prefix
  app.setGlobalPrefix('api');

  const productionOrigins = (process.env.FRONTEND_URL ?? '').split(',').filter(Boolean);

  app.enableCors({
    // Reflect local origins during development. In production, only use the explicit allow-list.
    origin: process.env.NODE_ENV === 'production' ? productionOrigins : true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  });

  app.useGlobalPipes(
    // whitelist: true - strips any properties that are not in the DTO
    // forbidNonWhitelisted: true - throws an error if any properties are not in the DTO
    // transform: true - automatically transforms payloads to be objects typed according to their DTO classes
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const port = Number(process.env.PORT ?? 3001);
 
  try {
    
    await app.listen(port);
    logger.log(`Blog API listening on port ${port}`);

  } catch (error: unknown) {

    logger.error(`Could not start blog API on port ${port}`, error instanceof Error ? error.stack : String(error));
    await app.close();

    throw error;
  }
}
void bootstrap().catch(() => process.exit(1));
