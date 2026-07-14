ALTER TABLE "documents" ADD COLUMN "draft_segments" jsonb;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD COLUMN "segments" jsonb;
