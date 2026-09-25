import { Body, Controller, Get, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { CurrentTenant, CurrentUser, JwtAuthGuard } from '../auth/guards';
import { JwtPayload } from '../auth/jwt.strategy';
import { AgentChatDto } from './dto';
import { AgentService } from './agent.service';
import { McpClientService } from './mcp-client.service';
import { BlogToolsService } from './blog-tools.service';

@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly mcp: McpClientService,
    private readonly blogTools: BlogToolsService,
  ) {}

  @Post('chat')
  chat(@CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string, @Body() dto: AgentChatDto) {
    return this.agent.chat(dto.message, user.sub, tenantId, dto.toolName);
  }

  @Get('mcp/tools')
  listTools(@CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string) {
    return this.mcp.listTools(user.sub, tenantId);
  }

  @Post('mcp/tools/call')
  callMcpTool(
    @CurrentUser() user: JwtPayload,
    @CurrentTenant() tenantId: string,
    @Body() body: { name?: string; arguments?: Record<string, unknown> },
  ) {
    if (!body.name) throw new UnauthorizedException('Tool name is required');
    return this.mcp.callTool(user.sub, tenantId, body.name, body.arguments ?? {});
  }

  @Get('tools')
  localTools() {
    return { tools: this.blogTools.listTools() };
  }

  @Post('tools/call')
  callLocalTool(
    @CurrentUser() user: JwtPayload,
    @CurrentTenant() tenantId: string,
    @Body() body: { name?: string; arguments?: Record<string, unknown> },
  ) {
    if (!body.name) throw new UnauthorizedException('Tool name is required');
    return this.blogTools.call(body.name, body.arguments ?? {}, user.sub, tenantId);
  }
}
