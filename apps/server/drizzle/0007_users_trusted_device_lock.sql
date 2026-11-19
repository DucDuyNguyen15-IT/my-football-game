ALTER TABLE "users" ADD COLUMN "trusted_failed_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trusted_failed_window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trusted_locked_until" timestamp with time zone;