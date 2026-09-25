import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto, ListPostsDto, UpdatePostDto } from './dto';

const authorSelect = { id: true, name: true } satisfies Prisma.UserSelect;
const postInclude = { author: { select: authorSelect } } satisfies Prisma.PostInclude;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantIdFor(tenantId?: string): string {
    return this.prisma.requireTenant(tenantId);
  }

  private publicPostWhere(where: Prisma.PostWhereInput = {}): Prisma.PostWhereInput {
    return { ...where, published: true };
  }

  private slugify(title: string): string {
    return (
      title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'post'
    );
  }

  private async uniqueSlug(title: string, tenantId?: string, ignoreId?: string): Promise<string> {
    const root = this.slugify(title);
    let slug = root;
    let index = 2;
    while (true) {
      const existing = await this.prisma.post.findFirst({
        where: this.prisma.tenantWhere({ slug }, this.tenantIdFor(tenantId)),
        select: { id: true },
      });
      if (!existing || existing.id === ignoreId) return slug;
      slug = `${root}-${index++}`;
    }
  }

  async list(query: ListPostsDto, tenantId?: string) {
    const currentTenantId = tenantId ? this.tenantIdFor(tenantId) : undefined;
    const where: Prisma.PostWhereInput = currentTenantId
      ? this.prisma.tenantWhere(
          {
            published: true,
            ...(query.tag ? { tags: { has: query.tag } } : {}),
          },
          currentTenantId,
        )
      : this.publicPostWhere({ ...(query.tag ? { tags: { has: query.tag } } : {}) });

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

  async findBySlug(slug: string, tenantId?: string) {
    const currentTenantId = tenantId ? this.tenantIdFor(tenantId) : undefined;
    const post = await this.prisma.post.findFirst({
      where: currentTenantId ? this.prisma.tenantWhere({ slug, published: true }, currentTenantId) : this.publicPostWhere({ slug }),
      include: postInclude,
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async mine(authorId: string, tenantId?: string) {
    const currentTenantId = this.tenantIdFor(tenantId);
    return this.prisma.post.findMany({
      where: this.prisma.tenantWhere({ authorId }, currentTenantId),
      include: postInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findMine(id: string, authorId: string, tenantId?: string) {
    const currentTenantId = this.tenantIdFor(tenantId);
    const post = await this.prisma.post.findFirst({
      where: this.prisma.tenantWhere({ id, authorId }, currentTenantId),
      include: postInclude,
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async create(authorId: string, dto: CreatePostDto, tenantId?: string) {
    const currentTenantId = this.tenantIdFor(tenantId);
    return this.prisma.post.create({
      data: this.prisma.tenantData(
        {
          ...dto,
          slug: await this.uniqueSlug(dto.title, currentTenantId),
          authorId,
          tags: dto.tags ?? [],
        },
        currentTenantId,
      ),
      include: postInclude,
    });
  }

  async update(id: string, authorId: string, dto: UpdatePostDto, tenantId?: string) {
    const currentTenantId = this.tenantIdFor(tenantId);
    const post = await this.prisma.post.findUnique({
      where: this.prisma.tenantWhere({ id }, currentTenantId),
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== authorId)
      throw new ForbiddenException('You can only edit your own posts');
    const slug = dto.title ? await this.uniqueSlug(dto.title, currentTenantId, id) : undefined;
    return this.prisma.post.update({
      where: this.prisma.tenantWhere({ id }, currentTenantId),
      data: {
        ...dto,
        ...(dto.coverImage === null ? { coverImage: null } : {}),
        ...(dto.imageAlt === null ? { imageAlt: null } : {}),
        ...(slug ? { slug } : {}),
      },
      include: postInclude,
    });
  }

  async remove(id: string, authorId: string, tenantId?: string): Promise<void> {

    const currentTenantId = this.tenantIdFor(tenantId);

    const post = await this.prisma.post.findUnique({
      where: this.prisma.tenantWhere({ id }, currentTenantId),
      select: { authorId: true },
    });

    if (!post) throw new NotFoundException('Post not found');
    
    if (post.authorId !== authorId)

      throw new ForbiddenException('You can only delete your own posts');

    await this.prisma.post.delete({ where: this.prisma.tenantWhere({ id }, currentTenantId) });
  }

  async engagement(slug: string, userId: string | undefined, tenantId?: string) {
    const currentTenantId = this.tenantIdFor(tenantId);
    const post = await this.prisma.post.findFirst({
      where: this.prisma.tenantWhere({ slug, published: true }, currentTenantId),
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    const [likes, comments] = await this.prisma.$transaction([
      this.prisma.like.count({ where: this.prisma.tenantWhere({ postId: post.id }, currentTenantId) }),
      this.prisma.comment.findMany({
        where: this.prisma.tenantWhere({ postId: post.id, parentId: null }, currentTenantId),
        include: {
          user: { select: { id: true, name: true } },
          replies: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const liked = userId
      ? Boolean(
          await this.prisma.like.findUnique({
            where: { tenantId_userId_postId: { tenantId: currentTenantId, userId, postId: post.id } },
          }),
        )
      : false;
    return { likes, liked, comments };
  }

  async toggleLike(slug: string, userId: string, tenantId?: string) {
    const currentTenantId = this.tenantIdFor(tenantId);
    const post = await this.prisma.post.findFirst({
      where: this.prisma.tenantWhere({ slug, published: true }, currentTenantId),
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    const existing = await this.prisma.like.findUnique({
      where: { tenantId_userId_postId: { tenantId: currentTenantId, userId, postId: post.id } },
    });
    if (existing) await this.prisma.like.delete({ where: { id: existing.id } });
    else await this.prisma.like.create({ data: this.prisma.tenantData({ userId, postId: post.id }, currentTenantId) });
    return {
      liked: !existing,
      likes: await this.prisma.like.count({ where: this.prisma.tenantWhere({ postId: post.id }, currentTenantId) }),
    };
  }

  async addComment(slug: string, userId: string, content: string, tenantId?: string, parentId?: string) {
    const currentTenantId = this.tenantIdFor(tenantId);
    const post = await this.prisma.post.findFirst({
      where: this.prisma.tenantWhere({ slug, published: true }, currentTenantId),
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (parentId) {
      const parent = await this.prisma.comment.findFirst({
        where: this.prisma.tenantWhere({ id: parentId, postId: post.id }, currentTenantId),
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
    }
    return this.prisma.comment.create({
      data: this.prisma.tenantData({ content, userId, postId: post.id, parentId }, currentTenantId),
      include: { user: { select: { id: true, name: true } } },
    });
  }
}
