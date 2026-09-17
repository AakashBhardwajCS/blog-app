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
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreatePostDto, ListPostsDto, UpdatePostDto } from './dto';
import { PostsService } from './posts.service';
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}
  @Get() list(@Query() query: ListPostsDto) {
    return this.posts.list(query);
  }
  @UseGuards(JwtAuthGuard) @Get('mine/list') mine(@CurrentUser() user: JwtPayload) {
    return this.posts.mine(user.sub);
  }
  @Get(':slug') bySlug(@Param('slug') slug: string) {
    return this.posts.findBySlug(slug);
  }
  @UseGuards(JwtAuthGuard) @Post() create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePostDto,
  ) {
    return this.posts.create(user.sub, dto);
  }
  @UseGuards(JwtAuthGuard) @Patch(':id') update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update(id, user.sub, dto);
  }
  @UseGuards(JwtAuthGuard) @Delete(':id') async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.posts.remove(id, user.sub);
    return { success: true };
  }
}
