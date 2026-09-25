-- Etapa 2 de Documentos: estado en vivo (Yjs), acceso por enlace, invitaciones,
-- imágenes y versiones. Ver docs/PLAN-DOCUMENTOS.md, E2–E8.
-- CreateEnum
CREATE TYPE "DocumentLinkAccess" AS ENUM ('NONE', 'READ', 'EDIT');

-- CreateEnum
CREATE TYPE "DocumentRole" AS ENUM ('READ', 'EDIT');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "linkAccess" "DocumentLinkAccess" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "linkToken" TEXT,
ADD COLUMN     "yState" BYTEA;

-- CreateTable
CREATE TABLE "document_invites" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "DocumentRole" NOT NULL DEFAULT 'READ',
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_assets" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_asset_blobs" (
    "assetId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "document_asset_blobs_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "document_revisions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_invites_email_idx" ON "document_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "document_invites_documentId_email_key" ON "document_invites"("documentId", "email");

-- CreateIndex
CREATE INDEX "document_assets_documentId_idx" ON "document_assets"("documentId");

-- CreateIndex
CREATE INDEX "document_revisions_documentId_createdAt_idx" ON "document_revisions"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "documents_linkToken_key" ON "documents"("linkToken");

-- AddForeignKey
ALTER TABLE "document_invites" ADD CONSTRAINT "document_invites_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_assets" ADD CONSTRAINT "document_assets_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_asset_blobs" ADD CONSTRAINT "document_asset_blobs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "document_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

