-- CreateEnum
CREATE TYPE "WorkspaceKind" AS ENUM ('BOARDS', 'DOCUMENTS');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "kind" "WorkspaceKind" NOT NULL DEFAULT 'BOARDS';
