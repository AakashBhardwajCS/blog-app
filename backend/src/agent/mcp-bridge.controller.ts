import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlogToolsService } from './blog-tools.service';

@Controller('mcp')
export class McpBridgeController {
  constructor(
    private readonly tools: BlogToolsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('tools')
  list(@Headers('x-mcp-bridge-secret') secret: string) {
    this.assertSecret(secret);
    return { tools: this.tools.listTools() };
  }

  @Post('tools/call')
  async call(
    @Headers('x-mcp-bridge-secret') secret: string,
    @Headers('x-user-id') userId: string,
    @Body() body: { name?: string; arguments?: Record<string, unknown> },
  ) {
    this.assertSecret(secret);
    if (!body.name || !userId) throw new UnauthorizedException('Tool name and x-user-id are required');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });

    if (!user) throw new UnauthorizedException('User not found');

    return this.tools.call(body.name, body.arguments ?? {}, userId, user.tenantId);
  }

  private assertSecret(secret: string): void {
    if (!secret || secret !== process.env.MCP_BRIDGE_SECRET) {
      throw new UnauthorizedException('Invalid MCP bridge secret');
    }
  }
}