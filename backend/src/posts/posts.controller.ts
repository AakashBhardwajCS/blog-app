import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant, CurrentUser, JwtAuthGuard } from '../auth/guards';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreatePostDto, ListPostsDto, SearchPostsDto, UpdatePostDto } from './dto';
import { CreateCommentDto } from './comments.dto';
import { PostsService } from './posts.service';
import { RagService } from '../rag/rag.service';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly rag: RagService,
  ) {}

  // Every read is members-only and scoped to the reader's organization.
  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentTenant() tenantId: string, @Query() query: ListPostsDto) {
    return this.posts.list(query, tenantId);
  }

  /** Hybrid keyword + semantic search over the organization's published posts; declared before `:slug`. */
  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(@CurrentTenant() tenantId: string, @Query() query: SearchPostsDto) {
    return this.rag.searchPosts(query.q, { tenantId, department: query.department, limit: query.limit });
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine/list')
  mine(@CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string) {
    return this.posts.mine(user.sub, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':slug')
  bySlug(@CurrentTenant() tenantId: string, @Param('slug') slug: string) {
    return this.posts.findBySlug(slug, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':slug/engagement')
  engagement(@Param('slug') slug: string, @CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string) {
    return this.posts.engagement(slug, user.sub, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':slug/like')
  like(@Param('slug') slug: string, @CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string) {
    return this.posts.toggleLike(slug, user.sub, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':slug/comments')
  comment(
    @Param('slug') slug: string,
    @CurrentUser() user: JwtPayload,
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.posts.addComment(slug, user.sub, dto.content, tenantId, dto.parentId);
  }

  /** Comment authors can delete their own comments; owners and admins can delete any. Replies go with it. */
  @UseGuards(JwtAuthGuard)
  @Delete(':slug/comments/:commentId')
  async deleteComment(
    @Param('slug') slug: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: JwtPayload,
    @CurrentTenant() tenantId: string,
  ) {
    await this.posts.deleteComment(slug, commentId, user, tenantId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string, @Body() dto: CreatePostDto) {
    return this.posts.create(user.sub, dto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update(id, user.sub, dto, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string) {
    await this.posts.remove(id, user.sub, tenantId);
    return { success: true };
  }
}

