import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AgentModule } from './agent/agent.module';
import { OrganizationModule } from './organization/organization.module';
import { PostsModule } from './posts/posts.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { RagModule } from './rag/rag.module';
import { UploadsModule } from './uploads/uploads.module';

const envFilePath = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../backend/.env'),
].filter(existsSync);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath.length ? envFilePath : ['.env', './backend/.env'],
    }),
    PrismaModule,
    AuthModule,
    PostsModule,
    AgentModule,
    RagModule,
    UploadsModule,
    ProfileModule,
    OrganizationModule,
  ],
})

export class AppModule {}
