import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, Post, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type RagSource = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  score: number;
};

type RankedPost = Post & { score: number };
type ChatCompletion = { choices?: Array<{ message?: { content?: string } }> };

@Injectable()
export class RagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RagService.name);
  private readonly collectionPrefix = process.env.PGVECTOR_COLLECTION_PREFIX ?? 'crownstack_blog_articles';
  private readonly vectorDimension = Number(process.env.PGVECTOR_DIMENSION ?? 1536);
  private readonly vectorPrisma = new PrismaClient({
    datasourceUrl: process.env.PGVECTOR_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  private readonly lastIndexedAt = new Map<string, number>();
  private readonly indexing = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureVectorStore();
      const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
      await Promise.all(
        tenants.map(({ id }) =>
          this.syncPublishedPosts(id).catch((error: unknown) =>
            this.logger.warn(`Initial RAG indexing skipped for tenant ${id}: ${this.message(error)}`),
          ),
        ),
      );
    } catch (error) {
      this.logger.warn(`Initial RAG indexing skipped: ${this.message(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.vectorPrisma.$disconnect();
  }

  async ask(query: string, tenantId?: string): Promise<{ answer: string; sources: RagSource[]; mode: 'hybrid' | 'lexical' }> {
    const currentTenantId = this.prisma.requireTenant(tenantId);
    const posts = await this.retrieve(query, currentTenantId);
    if (posts.length === 0) {
      return { answer: 'I could not find a published article relevant to that question.', sources: [], mode: 'lexical' };
    }

    const context = posts
      .map((post, index) => `[${index + 1}] ${post.title}\n${post.content.slice(0, 1800)}\nSource: /posts/${post.slug}`)
      .join('\n\n');
    const answer = await this.generateAnswer(query, context);
    return {
      answer,
      mode: 'hybrid',
      sources: posts.map(({ id, title, slug, excerpt, score }) => ({ id, title, slug, excerpt, score })),
    };
  }

  async syncPublishedPosts(tenantId?: string): Promise<{ indexed: number }> {
    const currentTenantId = this.prisma.requireTenant(tenantId);
    const existing = this.indexing.get(currentTenantId);
    if (existing) {
      await existing;
      return { indexed: 0 };
    }
    const task = this.indexPublishedPosts(currentTenantId);
    this.indexing.set(currentTenantId, task);
    try {
      await task;
      return { indexed: await this.prisma.post.count({ where: this.prisma.tenantWhere({ published: true }, currentTenantId) }) };
    } finally {
      this.indexing.delete(currentTenantId);
    }
  }

  private async ensureVectorStore(): Promise<void> {
    await this.vectorPrisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    await this.vectorPrisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PostEmbedding" (
        id TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "postId" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "embedding" vector(${this.vectorDimension}),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.vectorPrisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "PostEmbedding_tenantId_postId_key" ON "PostEmbedding" ("tenantId", "postId");');
    await this.vectorPrisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PostEmbedding_tenantId_idx" ON "PostEmbedding" ("tenantId");');
    await this.vectorPrisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PostEmbedding_vector_idx" ON "PostEmbedding" USING hnsw ("embedding" vector_l2_ops);');
  }

  private async indexPublishedPosts(tenantId: string): Promise<void> {
    const posts = await this.prisma.post.findMany({ where: this.prisma.tenantWhere({ published: true }, tenantId) });
    if (posts.length === 0) {
      this.lastIndexedAt.set(tenantId, Date.now());
      return;
    }

    for (const post of posts) {
      const vector = this.toVectorLiteral(this.embeddingForText(this.documentFor(post)));
      await this.vectorPrisma.$executeRawUnsafe(
        `
          INSERT INTO "PostEmbedding" (id, "tenantId", "postId", "content", "embedding", "createdAt")
          VALUES ($1, $2, $3, $4, $5::vector, NOW())
          ON CONFLICT ("tenantId", "postId") DO UPDATE
          SET "content" = EXCLUDED."content",
              "embedding" = EXCLUDED."embedding",
              "createdAt" = NOW()
        `,
        this.embeddingId(post.id, tenantId),
        tenantId,
        post.id,
        this.documentFor(post),
        vector,
      );
    }

    this.lastIndexedAt.set(tenantId, Date.now());
    this.logger.log(`Indexed ${posts.length} published blog posts in pgvector for tenant ${tenantId}`);
  }

  private async retrieve(query: string, tenantId: string): Promise<RankedPost[]> {
    const lexical = await this.lexicalSearch(query, tenantId);
    const vector = await this.vectorSearch(query, tenantId);
    const merged = new Map<string, RankedPost>();
    const rankWeight = (rank: number): number => 1 / (60 + rank);

    lexical.forEach((post, index) => merged.set(post.id, { ...post, score: rankWeight(index + 1) * 1.2 }));
    vector.forEach((post, index) => {
      const existing = merged.get(post.id);
      const score = rankWeight(index + 1);
      merged.set(post.id, existing ? { ...existing, score: existing.score + score } : { ...post, score });
    });

    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  }

  private async lexicalSearch(query: string, tenantId: string): Promise<RankedPost[]> {
    const terms = query
      .split(/\s+/)
      .map((term) => term.replace(/[^\p{L}\p{N}-]/gu, ''))
      .filter((term) => term.length > 1)
      .slice(0, 8);
    if (terms.length === 0) return [];

    const where: Prisma.PostWhereInput = this.prisma.tenantWhere(
      {
        published: true,
        OR: terms.flatMap((term) => [
          { title: { contains: term, mode: 'insensitive' } },
          { excerpt: { contains: term, mode: 'insensitive' } },
          { content: { contains: term, mode: 'insensitive' } },
          { tags: { has: term } },
        ]),
      },
      tenantId,
    );

    const posts = await this.prisma.post.findMany({ where, take: 12, orderBy: { updatedAt: 'desc' } });
    return posts.map((post) => ({ ...post, score: 0 }));
  }

  private async vectorSearch(query: string, tenantId: string): Promise<RankedPost[]> {
    if (Date.now() - (this.lastIndexedAt.get(tenantId) ?? 0) > 5 * 60 * 1000) {
      void this.syncPublishedPosts(tenantId).catch((error: unknown) => this.logger.warn(`RAG refresh failed: ${this.message(error)}`));
    }

    const queryVector = this.toVectorLiteral(this.embeddingForText(query));
    const rows = await this.vectorPrisma.$queryRaw<Array<{ postId: string; score: number }>>`
      SELECT "postId", 1 - ("embedding" <=> ${queryVector}::vector) AS score
      FROM "PostEmbedding"
      WHERE "tenantId" = ${tenantId}
      ORDER BY "embedding" <=> ${queryVector}::vector
      LIMIT 8
    `;

    const ids = rows.map((row) => row.postId);
    if (ids.length === 0) return [];

    const posts = await this.prisma.post.findMany({
      where: this.prisma.tenantWhere({ id: { in: ids }, published: true }, tenantId),
    });
    const byId = new Map(posts.map((post) => [post.id, post]));
    return rows.flatMap((row) => {
      const post = byId.get(row.postId);
      return post ? [{ ...post, score: Number(row.score ?? 0) }] : [];
    });
  }

  private async generateAnswer(query: string, context: string): Promise<string> {
    const baseUrl = (process.env.LOCAL_LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
    const model = process.env.LOCAL_LLM_MODEL ?? 'llama3.1:8b';
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 500,
          messages: [
            {
              role: 'system',
              content:
                'Answer using only the provided CrownStack Blog excerpts. If the excerpts do not contain the answer, say so. Cite sources as [1], [2]. Keep the response grounded in the retrieved content and never invent facts.',
            },
            { role: 'user', content: `Question: ${query}\n\nExcerpts:\n${context}` },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
      const payload = (await response.json()) as ChatCompletion;
      return payload.choices?.[0]?.message?.content?.trim() ?? this.fallbackAnswer(context);
    } catch (error) {
      this.logger.warn(`RAG answer generation unavailable: ${this.message(error)}`);
      return this.fallbackAnswer(context);
    }
  }

  private fallbackAnswer(context: string): string {
    return `I found these relevant passages in the published articles:\n\n${context}`;
  }

  private documentFor(post: Post): string {
    return `${post.title}\n${post.excerpt ?? ''}\n${post.content}\nTags: ${post.tags.join(', ')}`;
  }

  private embeddingId(postId: string, tenantId: string): string {
    return `${tenantId}:${postId}`;
  }

  private embeddingForText(text: string): number[] {
    const vector = new Array(this.vectorDimension).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) return vector;

    for (const token of tokens) {
      const index = Math.abs(this.hashString(token)) % this.vectorDimension;
      vector[index] += 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0) || 1);
    return vector.map((value) => value / magnitude);
  }

  private hashString(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      hash ^= code;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private toVectorLiteral(values: number[]): string {
    return `[${values.map((value) => Number(value).toFixed(6)).join(',')}]`;
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
