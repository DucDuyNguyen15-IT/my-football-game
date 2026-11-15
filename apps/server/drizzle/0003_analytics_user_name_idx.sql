DROP INDEX "analytics_events_user_idx";--> statement-breakpoint
CREATE INDEX "analytics_events_user_name_created_idx" ON "analytics_events" USING btree ("user_id","name","created_at");