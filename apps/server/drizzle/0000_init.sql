CREATE TYPE "public"."card_source" AS ENUM('starter', 'pack');--> statement-breakpoint
CREATE TYPE "public"."coin_tx_type" AS ENUM('starter_grant', 'pack_purchase', 'card_sale', 'upgrade_fee', 'match_reward', 'mission_reward', 'admin_adjust');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('easy', 'hard');--> statement-breakpoint
CREATE TYPE "public"."formation" AS ENUM('2-3-1', '3-2-1', '2-2-2');--> statement-breakpoint
CREATE TYPE "public"."match_outcome" AS ENUM('win', 'draw', 'loss', 'shootout_win', 'shootout_loss');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('started', 'finished', 'expired');--> statement-breakpoint
CREATE TYPE "public"."position" AS ENUM('GK', 'DF', 'MF', 'FW');--> statement-breakpoint
CREATE TYPE "public"."rarity" AS ENUM('bronze', 'silver', 'gold', 'legend');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analytics_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint,
	"name" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_upgrades" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "card_upgrades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"player_card_id" bigint NOT NULL,
	"material_player_card_id" bigint NOT NULL,
	"material_card_id" integer NOT NULL,
	"result" jsonb NOT NULL,
	"from_level" smallint NOT NULL,
	"to_level" smallint NOT NULL,
	"rate" smallint NOT NULL,
	"success" boolean NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" integer PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"nickname" text NOT NULL,
	"position" "position" NOT NULL,
	"rarity" "rarity" NOT NULL,
	"pace" smallint NOT NULL,
	"shooting" smallint NOT NULL,
	"passing" smallint NOT NULL,
	"dribbling" smallint NOT NULL,
	"defending" smallint NOT NULL,
	"stamina" smallint NOT NULL,
	"reflexes" smallint NOT NULL,
	"handling" smallint NOT NULL,
	"positioning" smallint NOT NULL,
	"kicking" smallint NOT NULL,
	"ovr" smallint NOT NULL,
	"avatar_seed" text NOT NULL,
	CONSTRAINT "cards_code_unique" UNIQUE("code"),
	CONSTRAINT "cards_stats_range" CHECK (least("cards"."pace", "cards"."shooting", "cards"."passing", "cards"."dribbling", "cards"."defending", "cards"."stamina", "cards"."reflexes", "cards"."handling", "cards"."positioning", "cards"."kicking") >= 1 and greatest("cards"."pace", "cards"."shooting", "cards"."passing", "cards"."dribbling", "cards"."defending", "cards"."stamina", "cards"."reflexes", "cards"."handling", "cards"."positioning", "cards"."kicking") <= 99),
	CONSTRAINT "cards_ovr_range" CHECK ("cards"."ovr" between 1 and 99)
);
--> statement-breakpoint
CREATE TABLE "coin_transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coin_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"type" "coin_tx_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" bigint NOT NULL,
	"ref_type" text,
	"ref_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coin_transactions_amount_nonzero" CHECK ("coin_transactions"."amount" <> 0),
	CONSTRAINT "coin_transactions_balance_nonneg" CHECK ("coin_transactions"."balance_after" >= 0),
	CONSTRAINT "coin_transactions_ref_type" CHECK ("coin_transactions"."ref_type" is null or "coin_transactions"."ref_type" in ('match', 'pack_opening', 'card_upgrade', 'player_card'))
);
--> statement-breakpoint
CREATE TABLE "daily_missions" (
	"user_id" bigint NOT NULL,
	"day" date NOT NULL,
	"mission_code" text NOT NULL,
	"progress" smallint DEFAULT 0 NOT NULL,
	"target" smallint NOT NULL,
	"reward" integer NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "daily_missions_pk" PRIMARY KEY("user_id","day","mission_code"),
	CONSTRAINT "daily_missions_progress_nonneg" CHECK ("daily_missions"."progress" >= 0)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "matches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"status" "match_status" DEFAULT 'started' NOT NULL,
	"seed" bigint NOT NULL,
	"squad_snapshot" jsonb NOT NULL,
	"reward_eligible" boolean NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"home_goals" smallint,
	"away_goals" smallint,
	"outcome" "match_outcome",
	"reward" integer DEFAULT 0 NOT NULL,
	"reward_day" date,
	CONSTRAINT "matches_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "matches_home_goals_range" CHECK ("matches"."home_goals" between 0 and 20),
	CONSTRAINT "matches_away_goals_range" CHECK ("matches"."away_goals" between 0 and 20),
	CONSTRAINT "matches_reward_nonneg" CHECK ("matches"."reward" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pack_boxes" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"bronze_left" smallint NOT NULL,
	"silver_left" smallint NOT NULL,
	"gold_left" smallint NOT NULL,
	"legend_left" smallint NOT NULL,
	"cycle" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pack_boxes_left_nonneg" CHECK ("pack_boxes"."bronze_left" >= 0 and "pack_boxes"."silver_left" >= 0 and "pack_boxes"."gold_left" >= 0 and "pack_boxes"."legend_left" >= 0),
	CONSTRAINT "pack_boxes_total_range" CHECK ("pack_boxes"."bronze_left" + "pack_boxes"."silver_left" + "pack_boxes"."gold_left" + "pack_boxes"."legend_left" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "pack_openings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pack_openings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"pack_code" text NOT NULL,
	"payment" text NOT NULL,
	"price" integer NOT NULL,
	"result" jsonb NOT NULL,
	"box_cycle" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_openings_payment" CHECK ("pack_openings"."payment" in ('coins', 'free_credit')),
	CONSTRAINT "pack_openings_price_nonneg" CHECK ("pack_openings"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_cards" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "player_cards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"card_id" integer NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL,
	"luck" smallint DEFAULT 0 NOT NULL,
	"source" "card_source" NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_cards_level_range" CHECK ("player_cards"."level" between 0 and 5),
	CONSTRAINT "player_cards_luck_range" CHECK ("player_cards"."luck" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_slots" (
	"user_id" bigint NOT NULL,
	"slot" text NOT NULL,
	"player_card_id" bigint NOT NULL,
	CONSTRAINT "squad_slots_pk" PRIMARY KEY("user_id","slot"),
	CONSTRAINT "squad_slots_player_card_uq" UNIQUE("player_card_id"),
	CONSTRAINT "squad_slots_slot" CHECK ("squad_slots"."slot" in ('GK', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'B1', 'B2', 'B3', 'B4', 'B5'))
);
--> statement-breakpoint
CREATE TABLE "squads" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"formation" "formation" DEFAULT '2-3-1' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"email" text,
	"coins" bigint DEFAULT 0 NOT NULL,
	"free_pack5_credits" smallint DEFAULT 0 NOT NULL,
	"failed_login_count" smallint DEFAULT 0 NOT NULL,
	"failed_login_window_start" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_coins_nonneg" CHECK ("users"."coins" >= 0),
	CONSTRAINT "users_free_pack5_nonneg" CHECK ("users"."free_pack5_credits" >= 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_upgrades" ADD CONSTRAINT "card_upgrades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_boxes" ADD CONSTRAINT "pack_boxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_openings" ADD CONSTRAINT "pack_openings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_cards" ADD CONSTRAINT "player_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_cards" ADD CONSTRAINT "player_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_slots" ADD CONSTRAINT "squad_slots_user_id_squads_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."squads"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_slots" ADD CONSTRAINT "squad_slots_player_card_id_player_cards_id_fk" FOREIGN KEY ("player_card_id") REFERENCES "public"."player_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_created_brin" ON "analytics_events" USING brin ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_name_created_idx" ON "analytics_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_user_idx" ON "analytics_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "card_upgrades_user_idx" ON "card_upgrades" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_upgrades_user_key_uq" ON "card_upgrades" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cards_rarity_idx" ON "cards" USING btree ("rarity");--> statement-breakpoint
CREATE INDEX "coin_transactions_user_id_idx" ON "coin_transactions" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "matches_user_started_idx" ON "matches" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "matches_user_reward_day_idx" ON "matches" USING btree ("user_id","reward_day") WHERE "matches"."reward" > 0;--> statement-breakpoint
CREATE UNIQUE INDEX "pack_openings_user_key_uq" ON "pack_openings" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "pack_openings_user_created_idx" ON "pack_openings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "player_cards_user_card_idx" ON "player_cards" USING btree ("user_id","card_id");--> statement-breakpoint
CREATE INDEX "player_cards_card_idx" ON "player_cards" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree (lower("username"));