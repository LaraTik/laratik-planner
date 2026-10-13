CREATE TABLE IF NOT EXISTS "trend_service_request_nonce" (
	"key_id" text NOT NULL,
	"nonce" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trend_service_request_nonce_pk'
  ) THEN
    ALTER TABLE "trend_service_request_nonce"
      ADD CONSTRAINT "trend_service_request_nonce_pk" PRIMARY KEY ("key_id", "nonce");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_service_request_nonce_expiry_idx"
  ON "trend_service_request_nonce" USING btree ("expires_at");
