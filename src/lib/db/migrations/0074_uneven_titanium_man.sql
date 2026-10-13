CREATE TABLE IF NOT EXISTS "advertising_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text,
	"timezone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_provider_valid" CHECK ("advertising_account"."provider" IN ('meta')),
	CONSTRAINT "advertising_account_status_valid" CHECK ("advertising_account"."status" IN ('active', 'unavailable', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_capability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"status" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_validation_result_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_capability_name_valid" CHECK ("advertising_capability"."capability" IN ('discover_accounts', 'read_campaigns', 'read_adsets', 'read_ads', 'read_creatives', 'read_reports', 'read_financials', 'manage_visibility_grants', 'run_diagnostics', 'use_ai_context', 'export_reports')),
	CONSTRAINT "advertising_capability_status_valid" CHECK ("advertising_capability"."status" IN ('available', 'unavailable', 'partial', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_connection_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_connection_account_status_valid" CHECK ("advertising_connection_account"."status" IN ('active', 'unavailable', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"owner_type" text DEFAULT 'platform' NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'invalid' NOT NULL,
	"credential_ref" text NOT NULL,
	"current_credential_version" integer DEFAULT 0 NOT NULL,
	"app_id" text,
	"graph_api_version" text,
	"last_validated_at" timestamp with time zone,
	"last_validation_status" text,
	"last_validation_code" text,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_provider_valid" CHECK ("advertising_connection"."provider" IN ('meta')),
	CONSTRAINT "advertising_connection_owner_type_valid" CHECK ("advertising_connection"."owner_type" IN ('platform', 'agency')),
	CONSTRAINT "advertising_connection_status_valid" CHECK ("advertising_connection"."status" IN ('active', 'revoked', 'invalid')),
	CONSTRAINT "advertising_connection_validation_status_valid" CHECK ("advertising_connection"."last_validation_status" IS NULL OR "advertising_connection"."last_validation_status" IN ('passed', 'failed', 'partial')),
	CONSTRAINT "advertising_connection_credential_version_valid" CHECK ("advertising_connection"."current_credential_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_credential_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"key_version" smallint DEFAULT 1 NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_credential_version_positive" CHECK ("advertising_credential_version"."version" > 0),
	CONSTRAINT "advertising_credential_key_version_positive" CHECK ("advertising_credential_version"."key_version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_financial_authority" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid,
	"account_id" uuid NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_financial_authority_range_valid" CHECK ("advertising_financial_authority"."ends_at" IS NULL OR "advertising_financial_authority"."ends_at" > "advertising_financial_authority"."starts_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_grant_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_grant_revision_action_valid" CHECK ("advertising_grant_revision"."action" IN ('created', 'updated', 'revoked')),
	CONSTRAINT "advertising_grant_revision_positive" CHECK ("advertising_grant_revision"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_social_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid,
	"provider" text NOT NULL,
	"identity_type" text NOT NULL,
	"external_identity_id" text NOT NULL,
	"display_name" text,
	"username" text,
	"parent_external_identity_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_provider_valid" CHECK ("advertising_social_identity"."provider" IN ('meta')),
	CONSTRAINT "advertising_social_identity_type_valid" CHECK ("advertising_social_identity"."identity_type" IN ('facebook_page', 'instagram_business')),
	CONSTRAINT "advertising_social_identity_status_valid" CHECK ("advertising_social_identity"."status" IN ('active', 'unavailable', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_state_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text NOT NULL,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"provider_request_id" text,
	"error_code" text,
	"partial" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_sync_run_status_valid" CHECK ("advertising_sync_run"."status" IN ('running', 'succeeded', 'partial', 'failed')),
	CONSTRAINT "advertising_sync_run_counts_nonnegative" CHECK ("advertising_sync_run"."rows_read" >= 0 AND "advertising_sync_run"."rows_written" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"cursor" text,
	"last_started_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_sync_state_status_valid" CHECK ("advertising_sync_state"."status" IN ('idle', 'running', 'partial', 'failed', 'paused'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_validation_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"sanitized_code" text,
	"provider_request_id" text,
	"retryable" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_validation_operation_valid" CHECK ("advertising_validation_result"."operation" IN ('account_discovery', 'campaign_read', 'adset_read', 'ad_read', 'creative_read', 'report_read', 'financial_read', 'diagnostics')),
	CONSTRAINT "advertising_validation_status_valid" CHECK ("advertising_validation_result"."status" IN ('passed', 'failed', 'partial', 'unavailable'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_visibility_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid,
	"account_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"campaign_ids" text[],
	"ad_set_ids" text[],
	"ad_ids" text[],
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_visibility_grant_capability_valid" CHECK ("advertising_visibility_grant"."capability" IN ('discover_accounts', 'read_campaigns', 'read_adsets', 'read_ads', 'read_creatives', 'read_reports', 'read_financials', 'manage_visibility_grants', 'run_diagnostics', 'use_ai_context', 'export_reports')),
	CONSTRAINT "advertising_visibility_grant_range_valid" CHECK ("advertising_visibility_grant"."ends_at" IS NULL OR "advertising_visibility_grant"."ends_at" > "advertising_visibility_grant"."starts_at")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_account_agency_id_agency_id_fk') THEN ALTER TABLE "advertising_account" ADD CONSTRAINT "advertising_account_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_capability_connection_id_advertising_connection_id_fk') THEN ALTER TABLE "advertising_capability" ADD CONSTRAINT "advertising_capability_connection_id_advertising_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."advertising_connection"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_capability_account_id_advertising_account_id_fk') THEN ALTER TABLE "advertising_capability" ADD CONSTRAINT "advertising_capability_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_connection_account_connection_id_advertising_connection_id_fk') THEN ALTER TABLE "advertising_connection_account" ADD CONSTRAINT "advertising_connection_account_connection_id_advertising_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."advertising_connection"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_connection_account_account_id_advertising_account_id_fk') THEN ALTER TABLE "advertising_connection_account" ADD CONSTRAINT "advertising_connection_account_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_connection_agency_id_agency_id_fk') THEN ALTER TABLE "advertising_connection" ADD CONSTRAINT "advertising_connection_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_connection_created_by_user_id_fk') THEN ALTER TABLE "advertising_connection" ADD CONSTRAINT "advertising_connection_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_credential_version_connection_id_advertising_connection_id_fk') THEN ALTER TABLE "advertising_credential_version" ADD CONSTRAINT "advertising_credential_version_connection_id_advertising_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."advertising_connection"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_credential_version_created_by_user_id_fk') THEN ALTER TABLE "advertising_credential_version" ADD CONSTRAINT "advertising_credential_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_financial_authority_agency_id_agency_id_fk') THEN ALTER TABLE "advertising_financial_authority" ADD CONSTRAINT "advertising_financial_authority_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_financial_authority_workspace_id_workspace_id_fk') THEN ALTER TABLE "advertising_financial_authority" ADD CONSTRAINT "advertising_financial_authority_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_financial_authority_account_id_advertising_account_id_fk') THEN ALTER TABLE "advertising_financial_authority" ADD CONSTRAINT "advertising_financial_authority_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_financial_authority_granted_by_user_id_fk') THEN ALTER TABLE "advertising_financial_authority" ADD CONSTRAINT "advertising_financial_authority_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_grant_revision_grant_id_advertising_visibility_grant_id_fk') THEN ALTER TABLE "advertising_grant_revision" ADD CONSTRAINT "advertising_grant_revision_grant_id_advertising_visibility_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."advertising_visibility_grant"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_grant_revision_changed_by_user_id_fk') THEN ALTER TABLE "advertising_grant_revision" ADD CONSTRAINT "advertising_grant_revision_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_social_identity_agency_id_agency_id_fk') THEN ALTER TABLE "advertising_social_identity" ADD CONSTRAINT "advertising_social_identity_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_social_identity_connection_id_advertising_connection_id_fk') THEN ALTER TABLE "advertising_social_identity" ADD CONSTRAINT "advertising_social_identity_connection_id_advertising_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."advertising_connection"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_social_identity_account_id_advertising_account_id_fk') THEN ALTER TABLE "advertising_social_identity" ADD CONSTRAINT "advertising_social_identity_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_sync_run_sync_state_id_advertising_sync_state_id_fk') THEN ALTER TABLE "advertising_sync_run" ADD CONSTRAINT "advertising_sync_run_sync_state_id_advertising_sync_state_id_fk" FOREIGN KEY ("sync_state_id") REFERENCES "public"."advertising_sync_state"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_sync_run_connection_id_advertising_connection_id_fk') THEN ALTER TABLE "advertising_sync_run" ADD CONSTRAINT "advertising_sync_run_connection_id_advertising_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."advertising_connection"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_sync_run_account_id_advertising_account_id_fk') THEN ALTER TABLE "advertising_sync_run" ADD CONSTRAINT "advertising_sync_run_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_sync_state_connection_id_advertising_connection_id_fk') THEN ALTER TABLE "advertising_sync_state" ADD CONSTRAINT "advertising_sync_state_connection_id_advertising_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."advertising_connection"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_sync_state_account_id_advertising_account_id_fk') THEN ALTER TABLE "advertising_sync_state" ADD CONSTRAINT "advertising_sync_state_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_validation_result_connection_id_advertising_connection_id_fk') THEN ALTER TABLE "advertising_validation_result" ADD CONSTRAINT "advertising_validation_result_connection_id_advertising_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."advertising_connection"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_validation_result_account_id_advertising_account_id_fk') THEN ALTER TABLE "advertising_validation_result" ADD CONSTRAINT "advertising_validation_result_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_visibility_grant_agency_id_agency_id_fk') THEN ALTER TABLE "advertising_visibility_grant" ADD CONSTRAINT "advertising_visibility_grant_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_visibility_grant_workspace_id_workspace_id_fk') THEN ALTER TABLE "advertising_visibility_grant" ADD CONSTRAINT "advertising_visibility_grant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_visibility_grant_account_id_advertising_account_id_fk') THEN ALTER TABLE "advertising_visibility_grant" ADD CONSTRAINT "advertising_visibility_grant_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_visibility_grant_granted_by_user_id_fk') THEN ALTER TABLE "advertising_visibility_grant" ADD CONSTRAINT "advertising_visibility_grant_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action; END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_account_agency_provider_external_uniq" ON "advertising_account" USING btree ("agency_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_account_agency_status_idx" ON "advertising_account" USING btree ("agency_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_capability_connection_account_capability_uniq" ON "advertising_capability" USING btree ("connection_id","account_id","capability");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_capability_account_idx" ON "advertising_capability" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_connection_account_pair_uniq" ON "advertising_connection_account" USING btree ("connection_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_connection_account_account_idx" ON "advertising_connection_account" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_connection_agency_idx" ON "advertising_connection" USING btree ("agency_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_connection_credential_ref_uniq" ON "advertising_connection" USING btree ("credential_ref");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_credential_connection_version_uniq" ON "advertising_credential_version" USING btree ("connection_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_credential_connection_active_idx" ON "advertising_credential_version" USING btree ("connection_id","revoked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_financial_authority_scope_idx" ON "advertising_financial_authority" USING btree ("workspace_id","account_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_grant_revision_grant_revision_uniq" ON "advertising_grant_revision" USING btree ("grant_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_social_identity_agency_provider_type_external_uniq" ON "advertising_social_identity" USING btree ("agency_id","provider","identity_type","external_identity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_social_identity_account_idx" ON "advertising_social_identity" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_sync_run_account_started_idx" ON "advertising_sync_run" USING btree ("account_id","started_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_sync_state_connection_account_uniq" ON "advertising_sync_state" USING btree ("connection_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_sync_state_due_idx" ON "advertising_sync_state" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_validation_connection_checked_idx" ON "advertising_validation_result" USING btree ("connection_id","checked_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_validation_account_checked_idx" ON "advertising_validation_result" USING btree ("account_id","checked_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_visibility_grant_workspace_idx" ON "advertising_visibility_grant" USING btree ("workspace_id","account_id","revoked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_visibility_grant_account_idx" ON "advertising_visibility_grant" USING btree ("account_id","capability","revoked_at");
