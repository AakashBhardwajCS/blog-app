/*
  Warnings:

  - Made the column `embedding` on table `PostEmbedding` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "PostEmbedding_vector_idx";

-- AlterTable
ALTER TABLE "PostEmbedding" ALTER COLUMN "embedding" SET NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);
