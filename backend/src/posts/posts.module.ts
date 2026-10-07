import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { RagModule } from '../rag/rag.module';

@Module({ imports: [RagModule], controllers: [PostsController], providers: [PostsService], exports: [PostsService] })

export class PostsModule {}
