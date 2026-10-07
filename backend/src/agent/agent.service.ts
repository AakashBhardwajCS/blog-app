import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { McpClientService, RemoteTool, RemoteToolResult } from './mcp-client.service';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

type ModelResponse = { choices?: Array<{ message?: ChatMessage }> };

const systemPrompt = `You are CrownStack Blog’s "Write with AI" assistant.

Your job is to research and draft blog articles for the authenticated author. You never save, publish, update, or delete posts: the author reviews the draft and saves it themselves.

Operating rules:
1. Use the websearch tool first whenever a response depends on current facts, external references, or recent industry context.
2. Only use facts, figures, dates, and URLs that appear in the websearch results. Never invent statistics, sources, or links. If the results do not cover something, leave it out or say it could not be confirmed.
3. If websearch is unavailable or returns no results, say so briefly and write only what you can support without specific current claims.
4. Follow the user’s requested topic, tone, structure, format, and target length exactly.
5. When the user specifies a word count or content_length, treat it as the target length and keep the final article close to that limit.
6. If websearch is called without maxResults, use 5 automatically and do not ask the user to supply it.
7. If the user asks you to save or publish, draft the article and remind them to use the Save draft button.

Final-answer rules:
- Return only the complete article in Markdown unless the user explicitly requests explanation, a summary, or separate metadata.
- Start the article with a single "# " heading containing its title.
- Link sources inline using the exact URLs from the websearch results.
- Do not include search summaries, tool output, JSON blobs, function signatures, or planning notes.
- Do not say “based on the search results” or describe the tool usage.
- Do not send partial drafts.`;

/** The agent only drafts. Saving is an explicit author action in the UI, so write tools are never offered to the model. */
const WRITE_TOOLS = new Set(['create_post', 'update_post', 'publish_post', 'delete_post']);

export type AgentDraft = { title: string; content: string };

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(private readonly mcp: McpClientService) {}

  async chat(message: string, userId: string, tenantId: string, requestedTool?: string): Promise<{ message: string; toolCalls: string[]; draft?: AgentDraft }> {
    const baseUrl = (process.env.LOCAL_LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
    const model = process.env.LOCAL_LLM_MODEL ?? 'llama3.1:8b';
    const shouldUseTools = Boolean(requestedTool) || this.shouldUseTools(message);
    const shouldWriteBlog = this.shouldWriteBlog(message);
    
    this.logger.log(`Agent request for user ${userId} in tenant ${tenantId}; tools=${shouldUseTools ? 'enabled' : 'disabled'}${requestedTool ? `; selected=${requestedTool}` : ''}`);
    if (requestedTool && WRITE_TOOLS.has(requestedTool)) {
      throw new ServiceUnavailableException(`Write with AI cannot call ${requestedTool}; save drafts from the editor instead`);
    }
    const discoveredTools = shouldUseTools
      ? (await this.mcp.listTools(userId, tenantId)).tools.filter((tool) => !WRITE_TOOLS.has(tool.name))
      : [];
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
          ? `${systemPrompt}\nToday is ${new Date().toISOString().slice(0, 10)}.\nThis is a writing request. Research first when useful, then produce a complete, coherent blog article. The final response must contain only the article unless the user explicitly asks for commentary.`
          : `${systemPrompt}\nToday is ${new Date().toISOString().slice(0, 10)}.`,
      },
      { role: 'user', content: message },
    ];
    const toolCalls: string[] = [];
    // Small local models often skip the search and answer from memory, so research is forced before drafting.
    const forceSearch = shouldWriteBlog && !requestedTool && remoteTools.some((tool) => tool.name === 'websearch');

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
                  : forceSearch && round === 0
                    ? { type: 'function', function: { name: 'websearch' } }
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
        const content = assistant.content ?? 'I could not produce a response.';
        return { message: content, toolCalls, ...(shouldWriteBlog && assistant.content ? { draft: this.toDraft(content, message) } : {}) };
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

  /** Splits the leading "# Title" heading off the article so the UI can save it as a post. */
  private toDraft(article: string, prompt: string): AgentDraft {
    const text = article.trim();
    const heading = text.match(/^#{1,2}\s+(.+)\n?/);
    const firstLine = text.split('\n', 1)[0].replace(/[#*_`]/g, '').trim();
    let title = (heading?.[1] ?? firstLine).replace(/[*_`]/g, '').trim();
    if (title.length < 3) title = prompt.trim();
    title = title.slice(0, 160);
    const body = (heading ? text.slice(heading[0].length) : text).trim() || text;
    return { title, content: this.markdownToHtml(body) };
  }

  /** Post pages render HTML, so the model's Markdown is escaped and converted to a small, safe subset. */
  private markdownToHtml(markdown: string): string {
    const escape = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const inline = (value: string) =>
      escape(value)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');

    return markdown
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const heading = block.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          const level = Math.min(Math.max(heading[1].length, 2), 4);
          return `<h${level}>${inline(heading[2])}</h${level}>`;
        }
        const lines = block.split('\n');
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
        }
        if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
          return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
        }
        return `<p>${lines.map(inline).join('<br />')}</p>`;
      })
      .join('\n');
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