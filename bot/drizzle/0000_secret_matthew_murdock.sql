DO $$ BEGIN
 CREATE TYPE "guild" AS ENUM('SIK', 'KIK');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "sport" AS ENUM('Running/Walking', 'Biking', 'Activity');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "log_events" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sport" "sport"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" bigint NOT NULL,
	"guild" "guild" NOT NULL,
	"sport" "sport" NOT NULL,
	"distance" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigint PRIMARY KEY NOT NULL,
	"user_name" text NOT NULL,
	"guild" "guild"
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "log_user_id_index" ON "logs" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "log_guild_index" ON "logs" ("guild");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "log_events" ADD CONSTRAINT "log_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
