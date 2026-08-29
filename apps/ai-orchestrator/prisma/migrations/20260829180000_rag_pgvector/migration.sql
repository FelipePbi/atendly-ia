-- GOAL 10: tenant-scoped business knowledge and vector retrieval.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "KnowledgeDocumentType" AS ENUM (
    'FAQ',
    'GUIDANCE',
    'CARE',
    'PROCEDURE',
    'BUSINESS_INFO',
    'TEXT_POLICY'
);

CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "KnowledgeDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeDocument_tenantId_id_key"
    ON "KnowledgeDocument"("tenantId", "id");
CREATE UNIQUE INDEX "KnowledgeDocument_tenantId_type_source_version_key"
    ON "KnowledgeDocument"("tenantId", "type", "source", "version");
CREATE INDEX "KnowledgeDocument_tenantId_status_updatedAt_idx"
    ON "KnowledgeDocument"("tenantId", "status", "updatedAt");
CREATE INDEX "KnowledgeChunk_tenantId_documentId_idx"
    ON "KnowledgeChunk"("tenantId", "documentId");

ALTER TABLE "KnowledgeChunk"
    ADD CONSTRAINT "KnowledgeChunk_tenantId_documentId_fkey"
    FOREIGN KEY ("tenantId", "documentId")
    REFERENCES "KnowledgeDocument"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
