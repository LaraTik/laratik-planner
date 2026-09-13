CREATE TABLE IF NOT EXISTS "mcp_access_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT ARRAY['content:read']::text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_access_token_name_length" CHECK (length(trim("mcp_access_token"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "mcp_access_token_prefix_length" CHECK (length("mcp_access_token"."token_prefix") BETWEEN 8 AND 24),
	CONSTRAINT "mcp_access_token_expiry_valid" CHECK ("mcp_access_token"."expires_at" > "mcp_access_token"."created_at"),
	CONSTRAINT "mcp_access_token_scopes_valid" CHECK ("mcp_access_token"."scopes" <@ ARRAY['content:read', 'content:write']::text[] AND cardinality("mcp_access_token"."scopes") > 0)
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mcp_access_token_user_id_user_id_fk'
      AND conrelid = 'mcp_access_token'::regclass
  ) THEN
    ALTER TABLE "mcp_access_token"
      ADD CONSTRAINT "mcp_access_token_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_access_token_hash_unique" ON "mcp_access_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_access_token_user_idx" ON "mcp_access_token" USING btree ("user_id","created_at");
