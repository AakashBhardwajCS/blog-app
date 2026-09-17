import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto, ListPostsDto, UpdatePostDto } from './dto';

const authorSelect = { id: true, name: true } satisfies Prisma.UserSelect;
const postInclude = { author: { select: authorSelect } } satisfies Prisma.PostInclude;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  private slugify(title: string): string {
    return (
      title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'post'
    );
  }

  private async uniqueSlug(title: string, ignoreId?: string): Promise<string> {
    const root = this.slugify(title);
    let slug = root;
    let index = 2;
    while (true) {
      const existing = await this.prisma.post.findUnique({ where: { slug }, select: { id: true } });
      if (!existing || existing.id === ignoreId) return slug;
      slug = `${root}-${index++}`;
    }
  }

  async list(query: ListPostsDto) {
    const where: Prisma.PostWhereInput = {
      published: true,
      ...(query.tag ? { tags: { has: query.tag } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: postInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.post.count({ where }),
    ]);
    return {
      items,
      meta: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    };
  }

  async findBySlug(slug: string) {
    const post = await this.prisma.post.findFirst({
      where: { slug, published: true },
      include: postInclude,
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async mine(authorId: string) {
    return this.prisma.post.findMany({
      where: { authorId },
      include: postInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(authorId: string, dto: CreatePostDto) {
    return this.prisma.post.create({
      data: { ...dto, slug: await this.uniqueSlug(dto.title), authorId, tags: dto.tags ?? [] },
      include: postInclude,
    });
  }

  async update(id: string, authorId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== authorId)
      throw new ForbiddenException('You can only edit your own posts');
    const slug = dto.title ? await this.uniqueSlug(dto.title, id) : undefined;
    return this.prisma.post.update({
      where: { id },
      data: { ...dto, ...(slug ? { slug } : {}) },
      include: postInclude,
    });
  }

  async remove(id: string, authorId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== authorId)
      throw new ForbiddenException('You can only delete your own posts');
    await this.prisma.post.delete({ where: { id } });
  }
}
