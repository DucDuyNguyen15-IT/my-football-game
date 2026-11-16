ALTER TABLE "cards" ADD COLUMN "weak_foot" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_weak_foot_range" CHECK ("cards"."weak_foot" between 2 and 5);