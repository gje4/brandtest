ALTER TABLE "tasks" ADD COLUMN "create_new_repo" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "new_repo_owner" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "original_repo_url" text;