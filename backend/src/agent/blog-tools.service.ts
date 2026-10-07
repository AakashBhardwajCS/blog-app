import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PostsService } from '../posts/posts.service';

export type BlogTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type ToolArguments = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const optionalText = (value: unknown): string | undefined => text(value) || undefined;
const requiredText = (args: ToolArguments, key: string): string => {
  const value = text(args[key]);
  if (!value) throw new BadRequestException(`${key} is required`);
  return value;
};

@Injectable()
export class BlogToolsService {
  private readonly logger = new Logger(BlogToolsService.name);

  constructor(private readonly posts: PostsService) {}

  listTools(): BlogTool[] {
    return [
      {
        name: 'list_my_posts',
        description: 'List all posts owned by the authenticated author, including drafts.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'get_my_post',
        description: 'Get one of the authenticated author\'s posts by id.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
      {
        name: 'create_post',
        description: "Create a draft or published blog post for the authenticated author. It is filed under the author's department automatically.",
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 160 },
            excerpt: { type: 'string', maxLength: 300 },
            content: { type: 'string', minLength: 1, maxLength: 50000 },
            coverImage: { type: 'string', maxLength: 2048 },
            imageAlt: { type: 'string', maxLength: 255 },
            published: { type: 'boolean' },
          },
          required: ['title', 'content'],
          additionalProperties: false,
        },
      },
      {
        name: 'update_post',
        description: 'Update one of the authenticated author\'s posts by id.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string', minLength: 3, maxLength: 160 },
            excerpt: { type: 'string', maxLength: 300 },
            content: { type: 'string', minLength: 1, maxLength: 50000 },
            coverImage: { type: 'string', maxLength: 2048 },
            imageAlt: { type: 'string', maxLength: 255 },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      {
        name: 'publish_post',
        description: 'Publish or unpublish one of the authenticated author\'s posts.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, published: { type: 'boolean' } },
          required: ['id', 'published'],
          additionalProperties: false,
        },
      },
      {
        name: 'delete_post',
        description: 'Permanently delete one of the authenticated author\'s posts by id.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    ];
  }

  async call(name: string, args: ToolArguments, userId: string, tenantId: string): Promise<ToolResult> {
    try {
      this.logger.debug(`Executing blog tool ${name} for user ${userId} in tenant ${tenantId}`);
      let result: unknown;
      switch (name) {
        case 'list_my_posts':
          result = await this.posts.mine(userId, tenantId);
          break;
        case 'get_my_post':
          result = await this.posts.findMine(requiredText(args, 'id'), userId, tenantId);
          break;
        case 'create_post':
          result = await this.posts.create(userId, {
            title: requiredText(args, 'title'),
            excerpt: optionalText(args.excerpt),
            content: requiredText(args, 'content'),
            coverImage: optionalText(args.coverImage),
            imageAlt: optionalText(args.imageAlt),
            published: args.published === true,
          }, tenantId);
          break;
        case 'update_post':
          result = await this.posts.update(requiredText(args, 'id'), userId, {
            title: optionalText(args.title),
            excerpt: optionalText(args.excerpt),
            content: optionalText(args.content),
            coverImage: optionalText(args.coverImage),
            imageAlt: optionalText(args.imageAlt),
          }, tenantId);
          break;
        case 'publish_post':
          result = await this.posts.update(requiredText(args, 'id'), userId, {
            published: args.published === true,
          }, tenantId);
          break;
        case 'delete_post':
          await this.posts.remove(requiredText(args, 'id'), userId, tenantId);
          result = { success: true };
          break;
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error: unknown) {
      this.logger.error(`Blog tool ${name} failed for user ${userId} in tenant ${tenantId}`, error instanceof Error ? error.stack : String(error));
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool execution failed' }],
        isError: true,
      };
    }
  }
}
