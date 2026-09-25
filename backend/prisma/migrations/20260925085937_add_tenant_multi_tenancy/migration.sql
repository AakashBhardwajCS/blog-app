-- DropIndex
DROP INDEX IF EXISTS "Comment_parentId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Comment_postId_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Like_postId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Like_userId_postId_key";

-- DropIndex
DROP INDEX IF EXISTS "Post_authorId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Post_published_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Post_slug_key";

-- DropIndex
DROP INDEX IF EXISTS "User_email_key";

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Tenant" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('tenant_default', 'Default Tenant', 'default-tenant', NOW(), NOW());

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Like" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Post" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;

UPDATE "Comment" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
UPDATE "Like" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
UPDATE "Post" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
UPDATE "User" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;

ALTER TABLE "Comment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Like" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Post" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Comment_tenantId_postId_createdAt_idx" ON "Comment"("tenantId", "postId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_tenantId_parentId_idx" ON "Comment"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "Like_tenantId_postId_idx" ON "Like"("tenantId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_tenantId_userId_postId_key" ON "Like"("tenantId", "userId", "postId");

-- CreateIndex
CREATE INDEX "Post_tenantId_published_createdAt_idx" ON "Post"("tenantId", "published", "createdAt");

-- CreateIndex
CREATE INDEX "Post_tenantId_authorId_idx" ON "Post"("tenantId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_tenantId_slug_key" ON "Post"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
