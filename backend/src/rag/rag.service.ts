import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Department, Post, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CHUNKER_VERSION, chunkText, hashedEmbedding, htmlToText, sentenceSpans } from './rag.text';

/**
 * Retrieval-augmented Q&A over a tenant's published blog posts.
 *
 * Pipeline:
 *  1. Indexing: each published post is converted to plain text, split into
 *     section-aware chunks, embedded, and stored in the pgvector database
 *     ("PostChunk" table) together with a Postgres full-text-search vector.
 *     Posts are only re-embedded when their content hash changes.
 *  2. Retrieval: the question is run through full-text search and vector
 *     similarity search in parallel; results are fused with Reciprocal Rank
 *     Fusion, filtered by a relevance floor, and capped per post for diversity.
 *  3. Generation: the selected chunks, grouped by article and numbered, are sent
 *     to the local LLM with instructions to answer only from them and cite [n].
 *
 * Embeddings come from an OpenAI-compatible `/embeddings` endpoint when
 * EMBEDDING_MODEL is set (e.g. `nomic-embed-text` on Ollama), falling back to a
 * local hashed embedding so the feature still works with no model running.
 */

export type RagSource = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  score: number;
};

export type RagAnswer = { answer: string; sources: RagSource[]; mode: 'hybrid' | 'lexical' };

export type PostSearchHit = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  department: Department;
  createdAt: Date;
  author: { id: string; name: string };
  /** Best-matching passage, for showing why the post matched. */
  snippet: string;
  /**
   * The sentence in `snippet` closest in meaning to the query, as `[start, end)` offsets.
   * Lets the UI show a semantic match even when it shares no words with the query.
   */
  passage: { start: number; end: number } | null;
  /** Heading of the section the snippet comes from, if any. */
  section: string | null;
  score: number;
  matchedBy: 'keyword' | 'semantic' | 'both';
  /** How close the post is in meaning; null when only keyword matching was possible. */
  meaning: 'strong' | 'close' | 'related' | null;
};

/**
 * `fallback` means the vector store was unreachable and a plain title/excerpt match was used.
 * `semantic` says whether meaning-based matching ran with a real embedding model for this query.
 */
export type PostSearchResult = { items: PostSearchHit[]; mode: 'hybrid' | 'lexical' | 'fallback'; semantic: boolean };
export type PostSearchOptions = { tenantId: string; department?: Department; limit?: number };
export type RagSyncResult = { indexed: number; updated: number; removed: number };

/** A chunk row as returned by the retrieval queries. */
type ChunkHit = {
  id: string;
  postId: string;
  chunkIndex: number;
  heading: string | null;
  content: string;
  score: number;
};

/** The query's embedding, kept so search can compare sentences against it without re-embedding. */
type EmbeddedQuery = { model: string; vector: number[] };

/** A chunk after rank fusion, remembering which retrievers found it. */
type RankedChunk = ChunkHit & { lexical: boolean; similarity: number | null };

/** Which chunks a retrieval may look at. `postIds` narrows it further, e.g. to one department's posts. */
type RetrievalScope = { tenantId: string; postIds?: string[] };

/**
 * How the keyword side parses the query: `natural` for questions (stemmed, stopwords
 * dropped), `prefix` for a search box, where the last word is often still being typed.
 */
type KeywordMode = 'natural' | 'prefix';

type IndexablePost = Pick<Post, 'id' | 'title' | 'excerpt' | 'content' | 'department'>;
type ChatCompletion = { choices?: Array<{ message?: { content?: string } }> };
type EmbeddingResponse = { data?: Array<{ embedding: number[]; index: number }> };

/** RRF constant; 60 is the value from the original paper and works well without tuning. */
const RRF_K = 60;
/** How many candidates each retriever contributes before fusion. */
const CANDIDATES_PER_RETRIEVER = 24;
/** Maximum chunks passed to the LLM, and how many of them may come from one article. */
const MAX_CONTEXT_CHUNKS = 8;
const MAX_CHUNKS_PER_POST = 3;
/** Background re-sync interval; content changes are also detected on every question. */
const RESYNC_INTERVAL_MS = 5 * 60 * 1000;
/** After the embedding endpoint fails, skip it for this long instead of paying the timeout on every call. */
const EMBEDDING_RETRY_AFTER_MS = 60 * 1000;
const EMBEDDING_BATCH_SIZE = 32;
/** Search ranks whole posts, so it looks at more chunks than a RAG answer does. */
const SEARCH_CANDIDATES_PER_RETRIEVER = 60;
const SEARCH_MAX_RESULTS = 50;
const SNIPPET_CHARS = 220;
/**
 * Semantic passages cost one embedding per sentence (~6 ms each on local nomic), so only
 * the top results get one, and the step is abandoned if it exceeds its time budget.
 */
const PASSAGE_RESULTS = 6;
const PASSAGE_MAX_SENTENCES = 10;
const PASSAGE_BUDGET_MS = 700;
/**
 * Cosine-similarity bands for the "meaning" label, measured with nomic-embed-text and
 * task prefixes: keyword-level matches ~0.72+, paraphrases ~0.55-0.65, noise <= ~0.45.
 */
const MEANING_STRONG = 0.68;
const MEANING_CLOSE = 0.58;
const MEANING_RELATED = 0.5;
/**
 * A sentence must be at least this similar to be highlighted as the passage. Deliberately
 * separate from RAG_MIN_SIMILARITY (the retrieval floor): single sentences score lower
 * than whole chunks, and the post has already passed retrieval by this point.
 */
const PASSAGE_MIN_SIMILARITY = 0.5;

@Injectable()
export class RagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RagService.name);

  // The vector store may live in a separate pgvector database from the app data.
  private readonly vectorPrisma = new PrismaClient({
    datasourceUrl: process.env.PGVECTOR_DATABASE_URL ?? process.env.DATABASE_URL,
  });

  private readonly llmBaseUrl = (process.env.LOCAL_LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
  private readonly llmModel = process.env.LOCAL_LLM_MODEL ?? 'llama3.1:8b';
  private readonly llmTimeoutMs = Number(process.env.RAG_LLM_TIMEOUT_MS ?? 30_000);

  private readonly embeddingBaseUrl = (process.env.EMBEDDING_BASE_URL ?? this.llmBaseUrl).replace(/\/$/, '');
  private readonly embeddingModel = process.env.EMBEDDING_MODEL?.trim() || null;
  // Retrieval models like nomic-embed-text are trained with task prefixes; using them
  // widens the similarity gap between relevant and unrelated chunks.
  private readonly queryPrefix = process.env.EMBEDDING_QUERY_PREFIX ?? (this.embeddingModel?.includes('nomic') ? 'search_query: ' : '');
  private readonly documentPrefix = process.env.EMBEDDING_DOCUMENT_PREFIX ?? (this.embeddingModel?.includes('nomic') ? 'search_document: ' : '');
  // Id stored with each vector. Prefixes change the vectors, so they are part of the id
  // and toggling them re-embeds existing posts on the next sync.
  private readonly remoteModelId = this.embeddingModel && `${this.embeddingModel}${this.queryPrefix || this.documentPrefix ? '+task-prefix' : ''}`;
  private readonly hashedDimension = Number(process.env.PGVECTOR_DIMENSION ?? 1536);
  // Stored alongside each vector so queries only compare vectors from the same model.
  private readonly hashedModelId = `hashed-v${CHUNKER_VERSION}-${this.hashedDimension}`;

  // Minimum cosine similarity for a chunk found *only* by vector search. Measured with
  // nomic-embed-text + prefixes: paraphrased matches score ~0.55+, unrelated text <= ~0.43.
  // Hashed vectors measure word overlap, so they need their own bar.
  private readonly minSimilarityModel = Number(process.env.RAG_MIN_SIMILARITY ?? 0.5);
  private readonly minSimilarityHashed = 0.3;
  /** Rough budget for the context sent to the LLM (~2.5k tokens). */
  private readonly maxContextChars = Number(process.env.RAG_MAX_CONTEXT_CHARS ?? 10_000);

  private storeReady: Promise<void> | null = null;
  private embeddingDownUntil = 0;
  /** Per tenant: `${publishedCount}:${latestUpdatedAt}` at the last sync, used to detect changes cheaply. */
  private readonly indexedFingerprint = new Map<string, string>();
  private readonly lastSyncedAt = new Map<string, number>();
  /** In-flight sync per tenant, so concurrent callers share one run. */
  private readonly syncing = new Map<string, Promise<RagSyncResult>>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Index in the background so a slow embedding model never blocks app startup.
    void this.prisma.tenant
      .findMany({ select: { id: true } })
      .then((tenants) =>
        Promise.all(
          tenants.map(({ id }) =>
            this.syncPublishedPosts(id).catch((error: unknown) =>
              this.logger.warn(`Initial RAG indexing skipped for tenant ${id}: ${this.message(error)}`),
            ),
          ),
        ),
      )
      .catch((error: unknown) => this.logger.warn(`Initial RAG indexing skipped: ${this.message(error)}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.vectorPrisma.$disconnect();
  }

  /** Answers a question from the tenant's published articles, citing the articles used. */
  async ask(query: string, tenantId: string): Promise<RagAnswer> {
    const currentTenantId = this.prisma.requireTenant(tenantId);
    await this.ensureFresh(currentTenantId);

    const { chunks, usedVectors } = await this.retrieve(query.trim(), currentTenantId);
    const mode = usedVectors ? 'hybrid' : 'lexical';

    // Resolve chunks back to live posts; drops anything unpublished since the last sync.
    const postIds = [...new Set(chunks.map((chunk) => chunk.postId))];
    const posts = await this.prisma.post.findMany({
      where: this.prisma.tenantWhere({ id: { in: postIds }, published: true }, currentTenantId),
      select: { id: true, title: true, slug: true, excerpt: true },
    });
    const postsById = new Map(posts.map((post) => [post.id, post]));
    const liveChunks = chunks.filter((chunk) => postsById.has(chunk.postId));

    if (liveChunks.length === 0) {
      return { answer: "I couldn't find anything in the published articles that answers that question.", sources: [], mode };
    }

    // Group chunks by article (in order of each article's best chunk) so citations are per article.
    const groups = new Map<string, RankedChunk[]>();
    for (const chunk of liveChunks) groups.set(chunk.postId, [...(groups.get(chunk.postId) ?? []), chunk]);

    const sources: RagSource[] = [];
    const sections: string[] = [];
    let budget = this.maxContextChars;
    for (const [postId, postChunks] of groups) {
      if (budget <= 0) break;
      const post = postsById.get(postId)!;
      // Within an article, present chunks in reading order rather than score order.
      const body = [...postChunks]
        .sort((a, b) => a.chunkIndex - b.chunkIndex)
        .map((chunk) => (chunk.heading ? `Section: ${chunk.heading}\n${chunk.content}` : chunk.content))
        .join('\n...\n')
        .slice(0, budget);
      budget -= body.length;
      sources.push({ ...post, score: Number(postChunks[0].score.toFixed(4)) });
      sections.push(`[${sources.length}] "${post.title}" (/posts/${post.slug})\n${body}`);
    }

    const answer = await this.generateAnswer(query, sections.join('\n\n---\n\n'), sources, groups);
    return { answer, sources, mode };
  }

  /**
   * Hybrid post search for the search bar: the same keyword + vector retrieval as
   * {@link ask}, restricted to one tenant's published posts (optionally one department)
   * and rolled up from chunks to posts, each ranked by its best chunk.
   */
  async searchPosts(query: string, options: PostSearchOptions): Promise<PostSearchResult> {
    const text = query.trim();
    const limit = Math.min(Math.max(options.limit ?? 20, 1), SEARCH_MAX_RESULTS);
    const base: Prisma.PostWhereInput = { published: true, ...(options.department ? { department: options.department } : {}) };
    const where = this.prisma.tenantWhere(base, options.tenantId);

    const candidates = await this.prisma.post.findMany({ where, select: { id: true } });
    if (!text || candidates.length === 0) return { items: [], mode: 'lexical', semantic: false };

    let chunks: RankedChunk[];
    let usedVectors: boolean;
    let embeddedQuery: EmbeddedQuery | null;
    try {
      await this.ensureFresh(options.tenantId);
      ({ chunks, usedVectors, query: embeddedQuery } = await this.fuse(
        text,
        { tenantId: options.tenantId, postIds: candidates.map((post) => post.id) },
        SEARCH_CANDIDATES_PER_RETRIEVER,
        'prefix',
      ));
    } catch (error) {
      this.logger.warn(`Hybrid search unavailable, using plain text match: ${this.message(error)}`);
      return this.fallbackSearch(text, where, limit);
    }

    // Chunks arrive best-first, so the first chunk seen for a post is its best one.
    // `similarity` keeps the post's closest chunk in meaning, which drives the meaning label.
    const byPost = new Map<string, { best: RankedChunk; lexical: boolean; semantic: boolean; similarity: number | null }>();
    for (const chunk of chunks) {
      const entry = byPost.get(chunk.postId);
      if (entry) {
        entry.lexical ||= chunk.lexical;
        entry.semantic ||= chunk.similarity !== null;
        if (chunk.similarity !== null) entry.similarity = Math.max(entry.similarity ?? -1, chunk.similarity);
      } else {
        byPost.set(chunk.postId, { best: chunk, lexical: chunk.lexical, semantic: chunk.similarity !== null, similarity: chunk.similarity });
      }
    }

    const ranked = [...byPost.values()].slice(0, limit);
    const posts = await this.prisma.post.findMany({
      where: { ...where, id: { in: ranked.map((entry) => entry.best.postId) } },
      select: { id: true, title: true, slug: true, excerpt: true, department: true, createdAt: true, author: { select: { id: true, name: true } } },
    });
    const postsById = new Map(posts.map((post) => [post.id, post]));
    const terms = searchTerms(text);
    // Meaning labels and passages only make sense for a real embedding model; the hashed
    // fallback measures word overlap, which the keyword highlights already show.
    const semanticQuery = embeddedQuery && embeddedQuery.model !== this.hashedModelId ? embeddedQuery : null;
    const passages = semanticQuery
      ? await this.closestSentences(semanticQuery, ranked.slice(0, PASSAGE_RESULTS).map((entry) => entry.best))
      : new Map<string, SentenceMatch>();

    const items = ranked.flatMap(({ best, lexical, semantic, similarity }): PostSearchHit[] => {
      const post = postsById.get(best.postId);
      if (!post) return [];
      const passage = passages.get(best.id);
      const { snippet, span } = passage ? snippetAroundSpan(cleanSnippetText(best.content), passage) : { snippet: snippetAround(best.content, terms), span: null };
      return [{
        ...post,
        snippet,
        passage: span,
        section: best.heading && best.heading !== 'Summary' ? best.heading : null,
        score: Number(best.score.toFixed(4)),
        matchedBy: lexical && semantic ? 'both' : lexical ? 'keyword' : 'semantic',
        meaning: semanticQuery ? this.meaningLabel(similarity) : null,
      }];
    });
    return { items, mode: usedVectors ? 'hybrid' : 'lexical', semantic: semanticQuery !== null };
  }

  /**
   * For each chunk, finds the sentence closest in meaning to the query. Sentences are
   * embedded in one batch; the whole step is skipped (no passages, same results) if the
   * embedding model is slow or unavailable, so search latency stays bounded.
   */
  private async closestSentences(query: EmbeddedQuery, chunks: RankedChunk[]): Promise<Map<string, SentenceMatch>> {
    const candidates = chunks.flatMap((chunk) => {
      const text = cleanSnippetText(chunk.content);
      return sentenceSpans(text)
        .slice(0, PASSAGE_MAX_SENTENCES)
        .map((span) => ({ chunkId: chunk.id, ...span, sentence: text.slice(span.start, span.end) }));
    });
    const matches = new Map<string, SentenceMatch>();
    if (candidates.length === 0) return matches;

    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), PASSAGE_BUDGET_MS); });
    try {
      const embedded = await Promise.race([this.embed(candidates.map((candidate) => candidate.sentence), 'document'), budget]);
      // A fallback to hashed vectors can't be compared with the model's query vector.
      if (!embedded || embedded.model !== query.model) return matches;

      candidates.forEach((candidate, index) => {
        const similarity = cosine(query.vector, embedded.vectors[index]);
        const current = matches.get(candidate.chunkId);
        if (similarity >= PASSAGE_MIN_SIMILARITY && (!current || similarity > current.similarity)) {
          matches.set(candidate.chunkId, { start: candidate.start, end: candidate.end, similarity });
        }
      });
    } catch (error) {
      this.logger.warn(`Semantic passages skipped: ${this.message(error)}`);
    } finally {
      clearTimeout(timer);
    }
    return matches;
  }

  private meaningLabel(similarity: number | null): PostSearchHit['meaning'] {
    if (similarity === null) return null;
    if (similarity >= MEANING_STRONG) return 'strong';
    if (similarity >= MEANING_CLOSE) return 'close';
    return similarity >= MEANING_RELATED ? 'related' : null;
  }

  /** Used only when the vector database is down, so search degrades instead of failing. */
  private async fallbackSearch(text: string, where: Prisma.PostWhereInput, limit: number): Promise<PostSearchResult> {
    const posts = await this.prisma.post.findMany({
      where: {
        ...where,
        OR: [
          { title: { contains: text, mode: 'insensitive' } },
          { excerpt: { contains: text, mode: 'insensitive' } },
          { content: { contains: text, mode: 'insensitive' } },
        ],
      },
      select: { id: true, title: true, slug: true, excerpt: true, content: true, department: true, createdAt: true, author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const terms = searchTerms(text);
    const items = posts.map(({ content, ...post }): PostSearchHit => ({
      ...post,
      snippet: snippetAround(htmlToText(content), terms),
      passage: null,
      section: null,
      score: 0,
      matchedBy: 'keyword',
      meaning: null,
    }));
    return { items, mode: 'fallback', semantic: false };
  }

  /**
   * Brings the tenant's index in line with its published posts: embeds new or
   * changed posts and removes chunks for posts that were deleted or unpublished.
   * Concurrent calls for the same tenant share one run.
   */
  async syncPublishedPosts(tenantId: string): Promise<RagSyncResult> {
    const currentTenantId = this.prisma.requireTenant(tenantId);
    const inFlight = this.syncing.get(currentTenantId);
    if (inFlight) return inFlight;

    const task = this.indexTenant(currentTenantId).finally(() => this.syncing.delete(currentTenantId));
    this.syncing.set(currentTenantId, task);
    return task;
  }

  // ---------------------------------------------------------------------------
  // Indexing
  // ---------------------------------------------------------------------------

  /**
   * Re-indexes before answering if posts changed since the last sync (so a
   * just-published article is immediately answerable); otherwise refreshes in
   * the background every few minutes, e.g. to upgrade hashed vectors once the
   * embedding model becomes reachable.
   */
  private async ensureFresh(tenantId: string): Promise<void> {
    const fingerprint = await this.publishedFingerprint(tenantId);
    if (fingerprint !== this.indexedFingerprint.get(tenantId)) {
      // A failed sync shouldn't fail the question; answer from the existing index.
      await this.syncPublishedPosts(tenantId).catch((error: unknown) => this.logger.warn(`RAG sync failed: ${this.message(error)}`));
    } else if (Date.now() - (this.lastSyncedAt.get(tenantId) ?? 0) > RESYNC_INTERVAL_MS) {
      void this.syncPublishedPosts(tenantId).catch((error: unknown) => this.logger.warn(`RAG refresh failed: ${this.message(error)}`));
    }
  }

  /** Cheap change detector: publish, unpublish, edit and delete all move the count or the latest updatedAt. */
  private async publishedFingerprint(tenantId: string): Promise<string> {
    const { _count, _max } = await this.prisma.post.aggregate({
      where: this.prisma.tenantWhere({ published: true }, tenantId),
      _count: { _all: true },
      _max: { updatedAt: true },
    });
    return `${_count._all}:${_max.updatedAt?.toISOString() ?? ''}`;
  }

  private async indexTenant(tenantId: string): Promise<RagSyncResult> {
    await this.ensureVectorStore();
    // Take the fingerprint before reading posts so an edit made mid-sync triggers another sync.
    const fingerprint = await this.publishedFingerprint(tenantId);

    const posts = await this.prisma.post.findMany({
      where: this.prisma.tenantWhere({ published: true }, tenantId),
      select: { id: true, title: true, excerpt: true, content: true, department: true },
    });
    const indexed = await this.vectorPrisma.$queryRawUnsafe<Array<{ postId: string; contentHash: string; embeddingModel: string }>>(
      `SELECT DISTINCT ON ("postId") "postId", "contentHash", "embeddingModel" FROM "PostChunk" WHERE "tenantId" = $1`,
      tenantId,
    );
    const indexedByPost = new Map(indexed.map((row) => [row.postId, row]));

    // Remove chunks for posts that are no longer published (deleted, unpublished, or moved).
    const publishedIds = new Set(posts.map((post) => post.id));
    const staleIds = indexed.map((row) => row.postId).filter((postId) => !publishedIds.has(postId));
    if (staleIds.length > 0) {
      await this.vectorPrisma.$executeRawUnsafe(`DELETE FROM "PostChunk" WHERE "tenantId" = $1 AND "postId" = ANY($2::text[])`, tenantId, staleIds);
    }

    let updated = 0;
    for (const post of posts) {
      const contentHash = this.contentHash(post);
      const existing = indexedByPost.get(post.id);
      // Re-embed if the content changed, or if the post was indexed with the hashed
      // fallback while a real embedding model is configured and currently reachable.
      const upgradeable = existing?.embeddingModel !== this.preferredModel && this.embeddingAvailable();
      if (existing?.contentHash === contentHash && !upgradeable) continue;

      try {
        await this.indexPost(tenantId, post, contentHash);
        updated += 1;
      } catch (error) {
        this.logger.warn(`RAG indexing failed for post ${post.id}: ${this.message(error)}`);
      }
    }

    this.indexedFingerprint.set(tenantId, fingerprint);
    this.lastSyncedAt.set(tenantId, Date.now());
    if (updated > 0 || staleIds.length > 0) {
      this.logger.log(`RAG index for tenant ${tenantId}: ${updated} post(s) embedded, ${staleIds.length} removed, ${posts.length} total`);
    }
    return { indexed: posts.length, updated, removed: staleIds.length };
  }

  /** Replaces all chunks of one post atomically. */
  private async indexPost(tenantId: string, post: IndexablePost, contentHash: string): Promise<void> {
    const chunks = this.chunksFor(post);
    // Title and section heading are embedded with each chunk so it carries its topic.
    const { model, vectors } = await this.embed(
      chunks.map((chunk) => [post.title, chunk.heading, chunk.text].filter(Boolean).join('\n\n')),
      'document',
    );

    await this.vectorPrisma.$transaction([
      this.vectorPrisma.$executeRawUnsafe(`DELETE FROM "PostChunk" WHERE "tenantId" = $1 AND "postId" = $2`, tenantId, post.id),
      ...chunks.map((chunk, index) =>
        this.vectorPrisma.$executeRawUnsafe(
          `INSERT INTO "PostChunk"
             (id, "tenantId", "postId", "chunkIndex", "title", "heading", "content", "contentHash", "embeddingModel", "embedding")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)`,
          `${tenantId}:${post.id}:${index}`,
          tenantId,
          post.id,
          index,
          post.title,
          chunk.heading,
          chunk.text,
          contentHash,
          model,
          this.toVectorLiteral(vectors[index]),
        ),
      ),
    ]);
  }

  /**
   * Chunk 0 is a summary (excerpt + department) that serves "which articles cover X"
   * and "what has the Sales team written" questions; the remaining chunks are the body.
   */
  private chunksFor(post: IndexablePost): Array<{ heading: string | null; text: string }> {
    const department = post.department.charAt(0) + post.department.slice(1).toLowerCase();
    const summary = [post.excerpt?.trim(), `Department: ${department}`].filter(Boolean).join('\n');
    const body = chunkText(htmlToText(post.content));
    const chunks = [...(summary ? [{ heading: 'Summary', text: summary }] : []), ...body];
    // Guarantee at least one chunk so the title is still searchable for empty posts.
    return chunks.length > 0 ? chunks : [{ heading: null, text: post.title }];
  }

  private contentHash(post: IndexablePost): string {
    return createHash('sha256')
      .update(JSON.stringify([CHUNKER_VERSION, post.title, post.excerpt, post.content, post.department]))
      .digest('hex');
  }

  /**
   * Creates the chunk table on first use (memoised; retried if it failed).
   *
   * The embedding column is dimension-less so the model can be swapped without a
   * migration; rows are filtered by `embeddingModel` so only comparable vectors
   * are ranked together. There is deliberately no ANN (HNSW) index: a blog-sized
   * corpus is fast to scan exactly, and ANN indexes combined with a tenant filter
   * can silently return fewer than LIMIT rows.
   */
  private ensureVectorStore(): Promise<void> {
    this.storeReady ??= (async () => {
      const statements = [
        'CREATE EXTENSION IF NOT EXISTS vector',
        `CREATE TABLE IF NOT EXISTS "PostChunk" (
           id TEXT PRIMARY KEY,
           "tenantId" TEXT NOT NULL,
           "postId" TEXT NOT NULL,
           "chunkIndex" INT NOT NULL,
           "title" TEXT NOT NULL,
           "heading" TEXT,
           "content" TEXT NOT NULL,
           "contentHash" TEXT NOT NULL,
           "embeddingModel" TEXT NOT NULL,
           "embedding" vector NOT NULL,
           -- Title matches outrank heading matches, which outrank body matches.
           "tsv" tsvector GENERATED ALWAYS AS (
             setweight(to_tsvector('english', "title"), 'A') ||
             setweight(to_tsvector('english', coalesce("heading", '')), 'B') ||
             setweight(to_tsvector('english', "content"), 'C')
           ) STORED,
           "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`,
        'CREATE INDEX IF NOT EXISTS "PostChunk_tenantId_postId_idx" ON "PostChunk" ("tenantId", "postId")',
        'CREATE INDEX IF NOT EXISTS "PostChunk_tsv_idx" ON "PostChunk" USING gin ("tsv")',
      ];
      for (const statement of statements) await this.vectorPrisma.$executeRawUnsafe(statement);
    })().catch((error: unknown) => {
      this.storeReady = null;
      throw error;
    });
    return this.storeReady;
  }

  // ---------------------------------------------------------------------------
  // Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Hybrid retrieval over chunks. Full-text search catches exact names and terms
   * (e.g. "NestJS", "pgvector"); vector search catches paraphrases. Results are
   * merged with Reciprocal Rank Fusion, which only uses ranks, so the two very
   * different score scales never need calibrating against each other.
   */
  private async retrieve(query: string, tenantId: string): Promise<{ chunks: RankedChunk[]; usedVectors: boolean }> {
    const { chunks: relevant } = await this.fuse(query, { tenantId }, CANDIDATES_PER_RETRIEVER, 'natural');

    // Cap chunks per article so one long post can't crowd out other relevant ones.
    const perPost = new Map<string, number>();
    const chunks = relevant.filter((chunk) => {
      const count = perPost.get(chunk.postId) ?? 0;
      if (count >= MAX_CHUNKS_PER_POST) return false;
      perPost.set(chunk.postId, count + 1);
      return true;
    }).slice(0, MAX_CONTEXT_CHUNKS);

    return { chunks, usedVectors: chunks.some((chunk) => chunk.similarity !== null) };
  }

  /** Runs both retrievers and returns every relevant chunk, best first, fused with RRF. */
  private async fuse(
    query: string,
    scope: RetrievalScope,
    candidates: number,
    keywordMode: KeywordMode,
  ): Promise<{ chunks: RankedChunk[]; usedVectors: boolean; query: EmbeddedQuery | null }> {
    await this.ensureVectorStore();
    const [lexical, vector] = await Promise.all([
      this.lexicalSearch(query, scope, candidates, keywordMode),
      this.vectorSearch(query, scope, candidates).catch((error: unknown) => {
        this.logger.warn(`RAG vector search failed, using full-text only: ${this.message(error)}`);
        return { hits: [] as ChunkHit[], minSimilarity: 1, query: null };
      }),
    ]);

    const fused = new Map<string, RankedChunk>();
    lexical.forEach((hit, rank) => {
      fused.set(hit.id, { ...hit, score: 1 / (RRF_K + rank + 1), lexical: true, similarity: null });
    });
    vector.hits.forEach((hit, rank) => {
      const rrf = 1 / (RRF_K + rank + 1);
      const existing = fused.get(hit.id);
      fused.set(hit.id, existing ? { ...existing, score: existing.score + rrf, similarity: hit.score } : { ...hit, score: rrf, lexical: false, similarity: hit.score });
    });

    // Relevance floor: RRF always ranks *something* first, so a chunk found only by
    // vector search must also be genuinely similar, or we would answer from noise.
    const chunks = [...fused.values()]
      .filter((chunk) => chunk.lexical || (chunk.similarity ?? 0) >= vector.minSimilarity)
      .sort((a, b) => b.score - a.score);

    return { chunks, usedVectors: chunks.some((chunk) => chunk.similarity !== null), query: vector.query };
  }

  /**
   * Postgres full-text search with stemming and stopword removal. `plainto_tsquery`
   * ANDs the terms, which is too strict for natural questions ("what do we know
   * about X"), so the ANDs are turned into ORs and `ts_rank_cd` rewards chunks that
   * match more terms close together.
   */
  private async lexicalSearch(query: string, scope: RetrievalScope, limit: number, mode: KeywordMode): Promise<ChunkHit[]> {
    // In prefix mode every word matches as a prefix ("kube" finds "Kubernetes"). The words are
    // reduced to letters and digits first, so user input can never inject tsquery syntax.
    const terms = mode === 'prefix' ? searchTerms(query) : [];
    if (mode === 'prefix' && terms.length === 0) return [];
    const tsquery = mode === 'prefix'
      ? `to_tsquery('english', $2)`
      : `replace(plainto_tsquery('english', $2)::text, '&', '|')::tsquery`;

    return this.vectorPrisma.$queryRawUnsafe<ChunkHit[]>(
      `WITH q AS (SELECT ${tsquery} AS query)
       SELECT c.id, c."postId", c."chunkIndex", c."heading", c."content",
              ts_rank_cd(c."tsv", q.query, 32)::float8 AS score
       FROM "PostChunk" c, q
       WHERE c."tenantId" = $1::text
         AND ($4::text[] IS NULL OR c."postId" = ANY($4::text[]))
         AND numnode(q.query) > 0 AND c."tsv" @@ q.query
       ORDER BY score DESC
       LIMIT $3`,
      scope.tenantId,
      mode === 'prefix' ? terms.map((term) => `${term}:*`).join(' | ') : query,
      limit,
      scope.postIds ?? null,
    );
  }

  /** Exact cosine-similarity search over chunks embedded with the same model as the query. */
  private async vectorSearch(
    query: string,
    scope: RetrievalScope,
    limit: number,
  ): Promise<{ hits: ChunkHit[]; minSimilarity: number; query: EmbeddedQuery }> {
    const { model, vectors } = await this.embed([query], 'query');
    const hits = await this.vectorPrisma.$queryRawUnsafe<ChunkHit[]>(
      `SELECT id, "postId", "chunkIndex", "heading", "content",
              (1 - ("embedding" <=> $2::vector))::float8 AS score
       FROM "PostChunk"
       WHERE "tenantId" = $1::text
         AND ($6::text[] IS NULL OR "postId" = ANY($6::text[]))
         AND "embeddingModel" = $3 AND vector_dims("embedding") = $4
       ORDER BY "embedding" <=> $2::vector
       LIMIT $5`,
      scope.tenantId,
      this.toVectorLiteral(vectors[0]),
      model,
      vectors[0].length,
      limit,
      scope.postIds ?? null,
    );
    return {
      hits,
      minSimilarity: model === this.hashedModelId ? this.minSimilarityHashed : this.minSimilarityModel,
      query: { model, vector: vectors[0] },
    };
  }

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  private get preferredModel(): string {
    return this.remoteModelId ?? this.hashedModelId;
  }

  private embeddingAvailable(): boolean {
    return this.embeddingModel !== null && Date.now() >= this.embeddingDownUntil;
  }

  /**
   * Embeds texts with the configured model, or the hashed fallback if none is set
   * or the endpoint is failing. Returns the model id actually used, which is
   * stored with each vector. `kind` selects the model's query or document task prefix.
   */
  private async embed(texts: string[], kind: 'query' | 'document'): Promise<{ model: string; vectors: number[][] }> {
    if (this.remoteModelId && this.embeddingAvailable()) {
      try {
        const prefix = kind === 'query' ? this.queryPrefix : this.documentPrefix;
        const vectors: number[][] = [];
        for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
          const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE).map((text) => prefix + text);
          vectors.push(...(await this.remoteEmbed(batch)));
        }
        return { model: this.remoteModelId, vectors };
      } catch (error) {
        this.embeddingDownUntil = Date.now() + EMBEDDING_RETRY_AFTER_MS;
        this.logger.warn(`Embedding model "${this.embeddingModel}" unavailable, using hashed fallback: ${this.message(error)}`);
      }
    }
    return { model: this.hashedModelId, vectors: texts.map((text) => hashedEmbedding(text, this.hashedDimension)) };
  }

  /** Calls an OpenAI-compatible `/embeddings` endpoint (Ollama, LM Studio, vLLM, OpenAI). */
  private async remoteEmbed(input: string[]): Promise<number[][]> {
    const response = await fetch(`${this.embeddingBaseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, input }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Embedding HTTP ${response.status}`);
    const payload = (await response.json()) as EmbeddingResponse;
    const data = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
    if (data.length !== input.length || data.some((item) => !Array.isArray(item.embedding) || item.embedding.length === 0)) {
      throw new Error('Embedding response did not match the request');
    }
    return data.map((item) => item.embedding);
  }

  private toVectorLiteral(values: number[]): string {
    return `[${values.map((value) => Number(value).toFixed(6)).join(',')}]`;
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  private async generateAnswer(query: string, context: string, sources: RagSource[], groups: Map<string, RankedChunk[]>): Promise<string> {
    try {
      const response = await fetch(`${this.llmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.llmModel,
          temperature: 0.1,
          max_tokens: 700,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            // Context before the question: small local models follow the question better when it comes last.
            { role: 'user', content: `Article excerpts:\n\n${context}\n\n===\n\nQuestion: ${query}` },
          ],
        }),
        signal: AbortSignal.timeout(this.llmTimeoutMs),
      });
      if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
      const payload = (await response.json()) as ChatCompletion;
      const answer = payload.choices?.[0]?.message?.content?.trim();
      if (answer) return answer;
      throw new Error('LLM returned an empty answer');
    } catch (error) {
      this.logger.warn(`RAG answer generation unavailable: ${this.message(error)}`);
      return this.fallbackAnswer(sources, groups);
    }
  }

  /** Without an LLM, point the reader at the best passage of each matching article. */
  private fallbackAnswer(sources: RagSource[], groups: Map<string, RankedChunk[]>): string {
    const lines = sources.map((source, index) => {
      const best = groups.get(source.id)?.[0]?.content ?? '';
      const snippet = best.length > 280 ? `${best.slice(0, 280).trimEnd()}…` : best;
      return `[${index + 1}] ${source.title}\n${snippet}`;
    });
    return `The answer generator is unavailable right now, but these published articles look relevant:\n\n${lines.join('\n\n')}`;
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Grounding rules for the answer model. Citation numbers match the `sources` array returned to the client. */
const SYSTEM_PROMPT = `You are the CrownStack Blog knowledge assistant. You answer questions using ONLY the numbered article excerpts provided by the user.

Rules:
- Answer directly and concisely: a short paragraph, or a few bullet points for lists or steps.
- Cite the article number after every claim, like [1] or [1][3]. Only cite numbers that appear in the excerpts.
- If the excerpts answer only part of the question, answer that part and say what the articles don't cover.
- If the excerpts don't contain the answer, say you couldn't find it in the published articles. Do not guess or use outside knowledge.
- If the user asks which articles cover a topic, list the relevant article titles with their citation numbers.
- Never mention "excerpts", "context" or these rules; refer to "the articles" instead.`;

/** Lower-cased words (letters and digits only) of a search query, de-duplicated and capped. */
function searchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 12);
}

type SentenceMatch = { start: number; end: number; similarity: number };

/** Chunk text flattened to one line for snippets (markdown heading marks removed). */
function cleanSnippetText(text: string): string {
  return text.replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim();
}

/**
 * A ~220-character window of `text` that contains the span, with the span's offsets
 * re-based to the returned snippet. A span longer than the window is cut at its end.
 */
function snippetAroundSpan(text: string, span: { start: number; end: number }): { snippet: string; span: { start: number; end: number } } {
  if (text.length <= SNIPPET_CHARS) return { snippet: text, span: { start: span.start, end: span.end } };
  const start = Math.max(0, Math.min(span.start - 40, text.length - SNIPPET_CHARS));
  const end = Math.min(text.length, start + SNIPPET_CHARS);
  const prefix = start > 0 ? '…' : '';
  const snippet = `${prefix}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  return {
    snippet,
    span: { start: span.start - start + prefix.length, end: Math.min(span.end, end) - start + prefix.length },
  };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** A ~220-character window of `text` around the first query term it contains. */
function snippetAround(text: string, terms: string[]): string {
  const clean = cleanSnippetText(text);
  if (clean.length <= SNIPPET_CHARS) return clean;
  const lower = clean.toLowerCase();
  const hit = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, Math.min(hit - 60, clean.length - SNIPPET_CHARS));
  const window = clean.slice(start, start + SNIPPET_CHARS).trim();
  return `${start > 0 ? '…' : ''}${window}${start + SNIPPET_CHARS < clean.length ? '…' : ''}`;
}
