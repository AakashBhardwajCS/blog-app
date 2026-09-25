import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { McpClientService } from './mcp-client.service';
import { BlogToolsService } from './blog-tools.service';
import { McpBridgeController } from './mcp-bridge.controller';

@Module({
  imports: [PostsModule],
  controllers: [AgentController, McpBridgeController],
  providers: [AgentService, McpClientService, BlogToolsService],
})
export class AgentModule {}