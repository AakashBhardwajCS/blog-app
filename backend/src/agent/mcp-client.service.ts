import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BlogToolsService, BlogTool, ToolResult } from './blog-tools.service';

export type RemoteTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type RemoteToolResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

const webSearchTool: RemoteTool = {
  name: 'websearch',
  description: 'Search the public web and return relevant result links and snippets.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, description: 'The web search query' },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        default: 5,
        description: 'Optional. Use 5 when omitted. Never ask the user for this value.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

@Injectable()
export class McpClientService {
  private readonly logger = new Logger(McpClientService.name);

  constructor(private readonly blogTools: BlogToolsService) {}

  private serverUrl(): string {
    return process.env.MCP_SERVER_URL ?? 'http://127.0.0.1:3002/mcp';
  }

  private async withClient<T>(userId: string, tenantId: string, action: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ name: 'Crownstack Blog-agent', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.serverUrl()), {
      requestInit: {
        headers: { 'x-user-id': userId, 'x-tenant-id': tenantId },
      },
    });

    try {
      this.logger.debug(`Connecting to MCP server at ${this.serverUrl()}`);
      await client.connect(transport);
      this.logger.debug('MCP connection established');
      return await action(client);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'MCP server is unavailable';
      this.logger.error(`MCP request failed: ${message}`, error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException(`Could not connect to MCP server: ${message}`);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async listTools(userId: string, tenantId: string): Promise<{ tools: Array<RemoteTool | BlogTool> }> {
    const localTools = this.blogTools.listTools();
    try {
      const remote = await this.withClient(userId, tenantId, async (client) =>
        client.listTools() as Promise<{ tools: RemoteTool[] }>,
      );
      const remoteNames = new Set(remote.tools.map((tool) => tool.name));
      this.logger.log(`Discovered ${remote.tools.length} remote MCP tools for user ${userId}`);
      return { tools: [...remote.tools, ...localTools.filter((tool) => !remoteNames.has(tool.name))] };
    } catch (error: unknown) {
      this.logger.warn(`Using local tool fallback for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
      return { tools: [webSearchTool, ...localTools] };
    }
  } 

  callTool(userId: string, tenantId: string, name: string, args: Record<string, unknown>): Promise<RemoteToolResult | ToolResult> {
    if (this.blogTools.listTools().some((tool) => tool.name === name)) {
      this.logger.log(`Calling local blog tool ${name} for user ${userId} in tenant ${tenantId}`);
      return this.blogTools.call(name, args, userId, tenantId);
    }
    this.logger.log(`Calling remote MCP tool ${name} for user ${userId} in tenant ${tenantId}`);
    const normalizedArgs = name === 'websearch'
      ? {
          ...args,
          maxResults: Math.max(1, Math.min(10, Number(args.maxResults ?? 5) || 5)),
        }
      : args;
    return this.withClient(userId, tenantId, async (client) =>
      client.callTool({ name, arguments: normalizedArgs }) as Promise<RemoteToolResult>,
    );
  }
}