import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Department, Prisma } from '@prisma/client';
import { isOrgAdmin } from '../auth/guards';
import { JwtPayload } from '../auth/jwt.strategy';
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

  /**
   * Verifies the user is an active member of the tenant. Returns their department, which every
   * new post is locked to, and whether they are an owner or admin (who may moderate any post).
   */
  private async assertAuthorInTenant(authorId: string, tenantId: string): Promise<{ department: Department; isAdmin: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { tenantId: true, department: true, orgRole: true, deactivatedAt: true },
    });

    if (!user || user.tenantId !== tenantId || user.deactivatedAt) {
      throw new ForbiddenException('User does not belong to this tenant');
    }
    return { department: user.department, isAdmin: isOrgAdmin(user.orgRole) };
  }

  async list(query: ListPostsDto, tenantId: string) {
    const where: Prisma.PostWhereInput = this.prisma.tenantWhere(
      { published: true, ...(query.department ? { department: query.department } : {}) },
      this.tenantIdFor(tenantId),
    );

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

  async findBySlug(slug: string, tenantId: string) {
    const post = await this.prisma.post.findFirst({
      where: this.prisma.tenantWhere({ slug, published: true }, this.tenantIdFor(tenantId)),
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
    const author = await this.assertAuthorInTenant(authorId, currentTenantId);
    return this.prisma.post.create({
      data: this.prisma.tenantData(
        {
          ...dto,
          slug: await this.uniqueSlug(dto.title, currentTenantId),
          authorId,
          department: author.department,
        },
        currentTenantId,
      ),
      include: postInclude,
    });
  }

  async update(id: string, authorId: string, dto: UpdatePostDto, tenantId?: string) {
    const currentTenantId = this.tenantIdFor(tenantId);
    const { isAdmin } = await this.assertAuthorInTenant(authorId, currentTenantId);
    const post = await this.prisma.post.findUnique({
      where: this.prisma.tenantWhere({ id }, currentTenantId),
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== authorId && !isAdmin)
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
    const { isAdmin } = await this.assertAuthorInTenant(authorId, currentTenantId);

    const post = await this.prisma.post.findUnique({
      where: this.prisma.tenantWhere({ id }, currentTenantId),
      select: { authorId: true },
    });

    if (!post) throw new NotFoundException('Post not found');

    if (post.authorId !== authorId && !isAdmin) throw new ForbiddenException('You can only delete your own posts');

    await this.prisma.post.delete({ where: this.prisma.tenantWhere({ id }, currentTenantId) });
  }

  async engagement(slug: string, userId: string, tenantId: string) {
    const post = await this.prisma.post.findFirst({
      where: this.prisma.tenantWhere({ slug, published: true }, this.tenantIdFor(tenantId)),
      select: { id: true, tenantId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    const currentTenantId = post.tenantId;
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
    const liked = Boolean(
      await this.prisma.like.findUnique({
        where: { tenantId_userId_postId: { tenantId: currentTenantId, userId, postId: post.id } },
      }),
    );
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

  async deleteComment(slug: string, commentId: string, actor: JwtPayload, tenantId: string): Promise<void> {
    const currentTenantId = this.tenantIdFor(tenantId);
    const comment = await this.prisma.comment.findFirst({
      where: this.prisma.tenantWhere({ id: commentId, post: { slug } }, currentTenantId),
      select: { id: true, userId: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== actor.sub && !isOrgAdmin(actor.orgRole)) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.prisma.comment.delete({ where: { id: comment.id } });
  }
}
