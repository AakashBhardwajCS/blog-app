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
import { CreatePostDto, ListPostsDto, UpdatePostDto } from './dto';
import { CreateCommentDto } from './comments.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  list(@Query() query: ListPostsDto) {
    return this.posts.list(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine/list')
  mine(@CurrentUser() user: JwtPayload, @CurrentTenant() tenantId: string) {
    return this.posts.mine(user.sub, tenantId);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.posts.findBySlug(slug);
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

