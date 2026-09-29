import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { McpClientService, RemoteTool, RemoteToolResult } from './mcp-client.service';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

type ModelResponse = { choices?: Array<{ message?: ChatMessage }> };

const systemPrompt = `You are CrownStack Blog’s writing assistant.

Your job is to draft and, when asked, save the final blog article for the authenticated author.

Operating rules:
1. Use the websearch tool first whenever a response depends on current facts, external references, or recent industry context.
2. If websearch is unavailable, rely only on the provided context and clearly avoid unsupported claims.
3. Follow the user’s requested topic, tone, structure, format, and target length exactly.
4. When the user specifies a word count or content_length, treat it as the target length and keep the final article close to that limit.
5. If websearch is called without maxResults, use 5 automatically and do not ask the user to supply it.
6. If the user asks to save, publish, or update a blog post, call the correct blog tool only after the final article text is ready.
7. For blog tool calls, send only the final article content in the content field and include a valid title, excerpt, coverImage, imageAlt, and tags only when the user requested them.
8. Keep every tool call grounded in the current tenant and user context. Never claim to have created or edited a blog outside the author’s scope.

Final-answer rules:
- Return only the complete article text unless the user explicitly requests explanation, a summary, or separate metadata.
- Do not include search summaries, tool output, JSON blobs, function signatures, or planning notes.
- Do not say “based on the search results” or describe the tool usage.
- Do not send partial drafts.
- Do not place hidden metadata, notes, or commentary inside the article itself.

Write the final article first, then continue with any requested save, publish, update, or delete action.`;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(private readonly mcp: McpClientService) {}

  async chat(message: string, userId: string, tenantId: string, requestedTool?: string): Promise<{ message: string; toolCalls: string[] }> {
    const baseUrl = (process.env.LOCAL_LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
    const model = process.env.LOCAL_LLM_MODEL ?? 'llama3.1:8b';
    const shouldUseTools = Boolean(requestedTool) || this.shouldUseTools(message);
    const shouldWriteBlog = this.shouldWriteBlog(message);
    
    this.logger.log(`Agent request for user ${userId} in tenant ${tenantId}; tools=${shouldUseTools ? 'enabled' : 'disabled'}${requestedTool ? `; selected=${requestedTool}` : ''}`);
    const discoveredTools = shouldUseTools ? (await this.mcp.listTools(userId, tenantId)).tools : [];
    const remoteTools = requestedTool
      ? discoveredTools.filter((tool) => tool.name === requestedTool)
      : discoveredTools;
    if (requestedTool && remoteTools.length === 0) {
      throw new ServiceUnavailableException(`MCP tool is not available: ${requestedTool}`);
    }
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: shouldWriteBlog
          ? `${systemPrompt}\nThis is a writing request. Research first when useful, then produce a complete, coherent blog article. The final response must contain only the article unless the user explicitly asks for commentary.`
          : systemPrompt,
      },
      { role: 'user', content: message },
    ];
    const toolCalls: string[] = [];

    for (let round = 0; round < 5; round += 1) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: shouldWriteBlog ? 1600 : 800,
          ...(remoteTools.length > 0
            ? {
                tools: remoteTools.map((tool) => this.openAiTool(tool)),
                tool_choice: requestedTool
                  ? { type: 'function', function: { name: requestedTool } }
                  : 'auto',
              }
            : {}),
        }),
      });
      if (!response.ok) {
        this.logger.error(`Local LLM returned HTTP ${response.status}`);
        throw new ServiceUnavailableException(`Local LLM returned ${response.status}`);
      }
      const payload = (await response.json()) as ModelResponse;
      const assistant = payload.choices?.[0]?.message;
      if (!assistant) throw new ServiceUnavailableException('Local LLM returned no message');
      messages.push(assistant);

      if (!assistant.tool_calls?.length) {
        return { message: assistant.content ?? 'I could not produce a response.', toolCalls };
      }

      for (const call of assistant.tool_calls) {
        toolCalls.push(call.function.name);
        this.logger.log(`Agent selected tool ${call.function.name} for user ${userId}`);
        let args: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(call.function.arguments);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          args = {};
        }
        const result: RemoteToolResult = await this.mcp.callTool(
          userId,
          tenantId,
          call.function.name,
          this.normalizeToolArguments(call.function.name, args),
        );
        if (result.isError) this.logger.warn(`Tool ${call.function.name} returned an error for user ${userId}`);
        messages.push({
          role: 'tool',
          content: result.content?.map((item) => item.text ?? JSON.stringify(item)).join('\n') ?? '',
          tool_call_id: call.id,
        });
        if (shouldWriteBlog) {
          messages.push({
            role: 'system',
            content: 'Now continue the requested writing workflow. Synthesize the research into the complete final blog article. Do not return search-result analysis or explain the tool call.',
          });
        }
      }
    }

    return { message: 'I reached the tool-call limit before finishing.', toolCalls };
  }

  private openAiTool(tool: RemoteTool) {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description ?? `MCP tool: ${tool.name}`,
        parameters: tool.inputSchema,
      },
    };
  }

  private shouldUseTools(message: string): boolean {
    return /\b(search|research|web|post|blog|draft|publish|unpublish|delete|remove|create|write|edit|update|list|show|find|read|tool)\b/i.test(
      message,
    );
  }

  private shouldWriteBlog(message: string): boolean {
    return /\b(write|draft|create|compose|author|article|blog post|post about|under \d+ words?)\b/i.test(message);
  }

  private normalizeToolArguments(name: string, args: Record<string, unknown>): Record<string, unknown> {
    if (name !== 'websearch' || typeof args.query !== 'string') return args;
    if (/^\s*mcp\s*$/i.test(args.query)) {
      return { ...args, query: 'Model Context Protocol MCP AI tools servers' };
    }
    return args;
  }
}