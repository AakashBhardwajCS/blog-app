CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Post"
  ADD COLUMN "coverImage" TEXT,
  ADD COLUMN "imageAlt" TEXT;

CREATE TABLE "PostEmbedding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostEmbedding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PostEmbedding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostEmbedding_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PostEmbedding_tenantId_postId_key"
    ON "PostEmbedding"("tenantId", "postId");

CREATE INDEX "PostEmbedding_tenantId_idx"
    ON "PostEmbedding"("tenantId");

CREATE INDEX "PostEmbedding_vector_idx"
    ON "PostEmbedding" USING hnsw ("embedding" vector_l2_ops);
