CREATE TYPE "public"."match_mode" AS ENUM('cpu', 'pvp_ranked', 'pvp_friendly');--> statement-breakpoint
CREATE TYPE "public"."pvp_end_reason" AS ENUM('full_time', 'forfeit_disconnect', 'forfeit_desync', 'void_desync', 'void_both_left', 'void_not_ready', 'server_restart');--> statement-breakpoint
CREATE TYPE "public"."pvp_kind" AS ENUM('ranked', 'friendly');--> statement-breakpoint
CREATE TYPE "public"."pvp_status" AS ENUM('live', 'finished', 'cancelled');--> statement-breakpoint
CREATE TABLE "pvp_matches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pvp_matches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "pvp_kind" NOT NULL,
	"home_user_id" bigint NOT NULL,
	"away_user_id" bigint NOT NULL,
	"seed" bigint NOT NULL,
	"squad_snapshot" jsonb NOT NULL,
	"status" "pvp_status" DEFAULT 'live' NOT NULL,
	"end_reason" "pvp_end_reason",
	"forfeit_user_id" bigint,
	"home_goals" smallint,
	"away_goals" smallint,
	"input_log" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "pvp_matches_distinct_users" CHECK ("pvp_matches"."home_user_id" <> "pvp_matches"."away_user_id"),
	CONSTRAINT "pvp_matches_home_goals_range" CHECK ("pvp_matches"."home_goals" between 0 and 20),
	CONSTRAINT "pvp_matches_away_goals_range" CHECK ("pvp_matches"."away_goals" between 0 and 20)
);
--> statement-breakpoint
DROP INDEX "matches_user_reward_day_idx";--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "mode" "match_mode" DEFAULT 'cpu' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "pvp_match_id" bigint;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "opponent_user_id" bigint;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "consumes_daily_cap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_matches" ADD CONSTRAINT "pvp_matches_home_user_id_users_id_fk" FOREIGN KEY ("home_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_matches" ADD CONSTRAINT "pvp_matches_away_user_id_users_id_fk" FOREIGN KEY ("away_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_matches" ADD CONSTRAINT "pvp_matches_forfeit_user_id_users_id_fk" FOREIGN KEY ("forfeit_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pvp_matches_home_started_idx" ON "pvp_matches" USING btree ("home_user_id","started_at");--> statement-breakpoint
CREATE INDEX "pvp_matches_away_started_idx" ON "pvp_matches" USING btree ("away_user_id","started_at");--> statement-breakpoint
CREATE INDEX "pvp_matches_ranked_finished_idx" ON "pvp_matches" USING btree ("kind","finished_at") WHERE "pvp_matches"."kind" = 'ranked' and "pvp_matches"."status" = 'finished';--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_pvp_match_id_pvp_matches_id_fk" FOREIGN KEY ("pvp_match_id") REFERENCES "public"."pvp_matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_user_id_users_id_fk" FOREIGN KEY ("opponent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_user_reward_day_idx" ON "matches" USING btree ("user_id","reward_day") WHERE "matches"."reward" > 0 or "matches"."consumes_daily_cap";--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_pvp_user_uniq" UNIQUE("pvp_match_id","user_id");