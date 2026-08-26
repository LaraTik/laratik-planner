CREATE TABLE "app_error_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"digest" text,
	"route" text NOT NULL,
	"method" text,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"request_id" text,
	"actor_id" uuid,
	"build_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_error_event" ADD CONSTRAINT "app_error_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_error_event_created_at_idx" ON "app_error_event" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "app_error_event_digest_idx" ON "app_error_event" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "app_error_event_route_idx" ON "app_error_event" USING btree ("route");--> statement-breakpoint
CREATE INDEX "app_error_event_actor_id_idx" ON "app_error_event" USING btree ("actor_id","created_at" DESC);