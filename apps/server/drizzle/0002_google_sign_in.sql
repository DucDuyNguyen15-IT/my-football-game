ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_sub" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_uq" ON "users" USING btree ("google_sub");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_has_login_method" CHECK ("users"."password_hash" is not null or "users"."google_sub" is not null);