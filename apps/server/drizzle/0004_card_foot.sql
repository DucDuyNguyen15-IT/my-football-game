CREATE TYPE "public"."foot" AS ENUM('right', 'left', 'both');--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "foot" "foot" DEFAULT 'right' NOT NULL;