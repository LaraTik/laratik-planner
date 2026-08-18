-- Extensions required by the laratik-planner schema.
-- pgcrypto: gen_random_uuid()
-- citext:   case-insensitive text (used for invitation emails)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
--> statement-breakpoint
CREATE TYPE "public"."activity_kind" AS ENUM('create', 'update', 'schedule_change', 'assignment', 'status_transition', 'comment', 'review', 'approval_reset', 'delivery', 'publication', 'archive', 'restore', 'invitation', 'ai_assistance');--> statement-breakpoint
CREATE TYPE "public"."agency_member_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."comment_label" AS ENUM('question', 'feedback', 'decision', 'general');--> statement-breakpoint
CREATE TYPE "public"."comment_visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."content_format" AS ENUM('static_post', 'carousel', 'story', 'short_form_video', 'long_form_video', 'live_content', 'article', 'other');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'content_review', 'approved_for_design', 'in_design', 'creative_review', 'ready_to_publish', 'partially_published', 'published', 'changes_requested', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."delivery_provider" AS ENUM('google_drive', 'dropbox', 'onedrive', 'frame_io', 'figma', 'canva', 'other');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('assignment', 'review_request', 'approval', 'changes_requested', 'mention', 'reply', 'unresolved_question', 'deadline', 'delivery', 'ready_to_publish', 'system');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('pending', 'published', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."review_gate" AS ENUM('content', 'creative_internal', 'creative_client');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'changes_requested', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'x', 'threads', 'pinterest', 'snapchat', 'other');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('workspace_manager', 'content_planner', 'designer', 'internal_reviewer', 'client_reviewer', 'publisher', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "account" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_pk" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "agency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"singleton_key" boolean DEFAULT true NOT NULL,
	"bootstrap_completed_at" timestamp with time zone,
	"settings" text DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_singleton_true" CHECK ("agency"."singleton_key" = true)
);
--> statement-breakpoint
CREATE TABLE "agency_membership" (
	"agency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "agency_member_status" NOT NULL,
	"is_agency_admin" boolean DEFAULT false NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bootstrap_lock" (
	"agency_id" uuid PRIMARY KEY NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"name" text,
	"image" text,
	"display_name" text NOT NULL,
	"avatar_path" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"last_active_at" timestamp with time zone,
	"role" text DEFAULT 'user' NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_format" CHECK ("user"."email" ~* '^[^@s]+@[^@s]+.[^@s]+$')
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_token_pk" UNIQUE("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "invitation_workspace_role" (
	"invitation_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" "workspace_role" NOT NULL,
	CONSTRAINT "invitation_workspace_role_invitation_id_workspace_id_role_pk" PRIMARY KEY("invitation_id","workspace_id","role"),
	CONSTRAINT "invitation_ws_role_unique" UNIQUE("invitation_id","workspace_id","role")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"invitee_name" text,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"grants_agency_admin" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_membership_role" (
	"workspace_membership_id" uuid NOT NULL,
	"role" "workspace_role" NOT NULL,
	CONSTRAINT "workspace_membership_role_workspace_membership_id_role_pk" PRIMARY KEY("workspace_membership_id","role")
);
--> statement-breakpoint
CREATE TABLE "workspace_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "agency_member_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"default_designer_id" uuid,
	"default_content_reviewer_id" uuid,
	"default_internal_creative_reviewer_id" uuid,
	"default_client_reviewer_id" uuid,
	"approval_mode" text DEFAULT 'simple' NOT NULL,
	"content_approval_lead_days" smallint DEFAULT 10 NOT NULL,
	"design_complete_lead_days" smallint DEFAULT 5 NOT NULL,
	"creative_approval_lead_days" smallint DEFAULT 2 NOT NULL,
	"ready_to_publish_lead_days" smallint DEFAULT 1 NOT NULL,
	"monthly_target" integer,
	"channel_targets" text DEFAULT '{}'::jsonb NOT NULL,
	"format_targets" text DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"logo_path" text,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_slug_format" CHECK ("workspace"."slug" ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$')
);
--> statement-breakpoint
CREATE TABLE "brand_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"value" text DEFAULT '{}'::jsonb NOT NULL,
	"storage_path" text,
	"external_url" text,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_asset_kind_valid" CHECK ("brand_asset"."kind" IN ('logo', 'color', 'font', 'guideline', 'reference', 'other'))
);
--> statement-breakpoint
CREATE TABLE "brand_voice_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"content" text NOT NULL,
	"sort_order" text DEFAULT '0' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_voice_type_valid" CHECK ("brand_voice_rule"."rule_type" IN ('tone', 'do', 'dont'))
);
--> statement-breakpoint
CREATE TABLE "social_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"account_name" text NOT NULL,
	"handle" text,
	"url" text,
	"account_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_channel_url_https" CHECK ("social_channel"."url" IS NULL OR "social_channel"."url" ~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"description" text,
	"start_date" date,
	"end_date" date,
	"owner_id" uuid,
	"cover_color" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_status_valid" CHECK ("campaign"."status" IN ('draft', 'active', 'completed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "content_pillar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" "content_format" NOT NULL,
	"default_channel_ids" text[] DEFAULT '{}'::uuid[] NOT NULL,
	"content_pillar_id" uuid,
	"brief_template" text,
	"format_payload" text DEFAULT '{}'::jsonb NOT NULL,
	"default_designer_id" uuid,
	"default_reviewer_id" uuid,
	"relative_schedule_rule" text DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"assignment_type" text NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "content_assignment_type_valid" CHECK ("content_assignment"."assignment_type" IN ('owner', 'designer', 'content_reviewer', 'internal_creative_reviewer', 'client_reviewer', 'publisher'))
);
--> statement-breakpoint
CREATE TABLE "content_item_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"social_channel_id" uuid NOT NULL,
	"planned_publish_at_override" timestamp with time zone,
	"caption" text,
	"call_to_action" text,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"platform_payload" text DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid,
	"content_pillar_id" uuid,
	"title" text NOT NULL,
	"format" "content_format" NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"format_payload" text DEFAULT '{}'::jsonb NOT NULL,
	"planned_publish_at" timestamp with time zone NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"status_return_target" "content_status",
	"change_request_gate" "review_gate",
	"priority" text DEFAULT 'normal' NOT NULL,
	"content_owner_id" uuid NOT NULL,
	"designer_id" uuid,
	"content_reviewer_id" uuid,
	"internal_creative_reviewer_id" uuid,
	"client_reviewer_id" uuid,
	"approved_delivery_version_id" uuid,
	"blocked_reason" text,
	"cancellation_reason" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_item_blocked_needs_reason" CHECK (status <> 'blocked' OR blocked_reason IS NOT NULL),
	CONSTRAINT "content_item_cancelled_needs_reason" CHECK (status <> 'cancelled' OR cancellation_reason IS NOT NULL),
	CONSTRAINT "content_item_changes_requested_needs_gate" CHECK (status <> 'changes_requested' OR change_request_gate IS NOT NULL),
	CONSTRAINT "content_item_other_statuses_no_gate" CHECK (status = 'changes_requested' OR change_request_gate IS NULL),
	CONSTRAINT "content_item_priority_valid" CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid,
	"comment_id" uuid,
	"delivery_version_id" uuid,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_kind_valid" CHECK ("attachment"."kind" IN ('reference', 'preview', 'logo', 'brief', 'comment'))
);
--> statement-breakpoint
CREATE TABLE "comment_mention" (
	"comment_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_mention_comment_id_mentioned_user_id_pk" PRIMARY KEY("comment_id","mentioned_user_id")
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_id" uuid NOT NULL,
	"visibility" "comment_visibility" NOT NULL,
	"label" "comment_label" DEFAULT 'general' NOT NULL,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_body_not_empty" CHECK (length("comment"."body") > 0)
);
--> statement-breakpoint
CREATE TABLE "approval_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" "review_status" NOT NULL,
	"feedback" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_decision_changes_needs_feedback" CHECK ("approval_decision"."decision" <> 'changes_requested' OR "approval_decision"."feedback" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "approval_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"gate" "review_gate" NOT NULL,
	"delivery_version_id" uuid,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"sequence" integer NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_version_id" uuid NOT NULL,
	"provider" "delivery_provider" NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"is_preview" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_link_url_https" CHECK ("delivery_link"."url" ~* '^https://')
);
--> statement-breakpoint
CREATE TABLE "delivery_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"description" text NOT NULL,
	"designer_note" text,
	"included_formats" text[] DEFAULT '{}'::text[] NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_final_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_version_number_positive" CHECK ("delivery_version"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "publication_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_channel_id" uuid NOT NULL,
	"status" "publication_status" DEFAULT 'pending' NOT NULL,
	"actual_published_at" timestamp with time zone,
	"published_url" text,
	"publisher_id" uuid,
	"note" text,
	"failure_reason" text,
	"attempt_number" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_published_needs_url_time_publisher" CHECK ("publication_record"."status" <> 'published' OR (
        "publication_record"."actual_published_at" IS NOT NULL
        AND "publication_record"."published_url" IS NOT NULL
        AND "publication_record"."publisher_id" IS NOT NULL
      )),
	CONSTRAINT "publication_skipped_needs_note" CHECK ("publication_record"."status" <> 'skipped' OR "publication_record"."note" IS NOT NULL),
	CONSTRAINT "publication_failed_needs_reason" CHECK ("publication_record"."status" <> 'failed' OR "publication_record"."failure_reason" IS NOT NULL),
	CONSTRAINT "publication_pending_clears_published_fields" CHECK ("publication_record"."status" <> 'pending' OR (
        "publication_record"."actual_published_at" IS NULL
        AND "publication_record"."published_url" IS NULL
        AND "publication_record"."publisher_id" IS NULL
      )),
	CONSTRAINT "publication_published_url_https" CHECK ("publication_record"."published_url" IS NULL OR "publication_record"."published_url" ~* '^https://'),
	CONSTRAINT "publication_attempt_non_negative" CHECK ("publication_record"."attempt_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "activity_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"before_data" text DEFAULT '{}'::jsonb NOT NULL,
	"after_data" text DEFAULT '{}'::jsonb NOT NULL,
	"metadata" text DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"digest_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "notification_preference_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"content_item_id" uuid,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"action_url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" text DEFAULT '{}'::jsonb NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"subject_hash" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"outcome" text NOT NULL,
	"request_id" text,
	"ip_hash" text,
	"metadata" text DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_feature_setting" (
	"agency_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model" text DEFAULT 'MiniMax-M3' NOT NULL,
	"enabled_capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"key_source" text DEFAULT 'environment' NOT NULL,
	"masked_key_suffix" text,
	"last_connection_test_at" timestamp with time zone,
	"last_connection_test_ok" boolean,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_item_id" uuid,
	"user_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"context_manifest" text DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_membership" ADD CONSTRAINT "agency_membership_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_membership" ADD CONSTRAINT "agency_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootstrap_lock" ADD CONSTRAINT "bootstrap_lock_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootstrap_lock" ADD CONSTRAINT "bootstrap_lock_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_workspace_role" ADD CONSTRAINT "invitation_workspace_role_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_workspace_role" ADD CONSTRAINT "invitation_workspace_role_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership_role" ADD CONSTRAINT "workspace_membership_role_workspace_membership_id_workspace_membership_id_fk" FOREIGN KEY ("workspace_membership_id") REFERENCES "public"."workspace_membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_default_designer_id_user_id_fk" FOREIGN KEY ("default_designer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_default_content_reviewer_id_user_id_fk" FOREIGN KEY ("default_content_reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_default_internal_creative_reviewer_id_user_id_fk" FOREIGN KEY ("default_internal_creative_reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_default_client_reviewer_id_user_id_fk" FOREIGN KEY ("default_client_reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_asset" ADD CONSTRAINT "brand_asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_asset" ADD CONSTRAINT "brand_asset_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voice_rule" ADD CONSTRAINT "brand_voice_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voice_rule" ADD CONSTRAINT "brand_voice_rule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_channel" ADD CONSTRAINT "social_channel_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_channel" ADD CONSTRAINT "social_channel_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pillar" ADD CONSTRAINT "content_pillar_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pillar" ADD CONSTRAINT "content_pillar_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_content_pillar_id_content_pillar_id_fk" FOREIGN KEY ("content_pillar_id") REFERENCES "public"."content_pillar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_default_designer_id_user_id_fk" FOREIGN KEY ("default_designer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_default_reviewer_id_user_id_fk" FOREIGN KEY ("default_reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assignment" ADD CONSTRAINT "content_assignment_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assignment" ADD CONSTRAINT "content_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assignment" ADD CONSTRAINT "content_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item_channel" ADD CONSTRAINT "content_item_channel_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item_channel" ADD CONSTRAINT "content_item_channel_social_channel_id_social_channel_id_fk" FOREIGN KEY ("social_channel_id") REFERENCES "public"."social_channel"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_content_pillar_id_content_pillar_id_fk" FOREIGN KEY ("content_pillar_id") REFERENCES "public"."content_pillar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_content_owner_id_user_id_fk" FOREIGN KEY ("content_owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_designer_id_user_id_fk" FOREIGN KEY ("designer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_content_reviewer_id_user_id_fk" FOREIGN KEY ("content_reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_internal_creative_reviewer_id_user_id_fk" FOREIGN KEY ("internal_creative_reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_client_reviewer_id_user_id_fk" FOREIGN KEY ("client_reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mention" ADD CONSTRAINT "comment_mention_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mention" ADD CONSTRAINT "comment_mention_mentioned_user_id_user_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_approval_request_id_approval_request_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_delivery_version_id_delivery_version_id_fk" FOREIGN KEY ("delivery_version_id") REFERENCES "public"."delivery_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_link" ADD CONSTRAINT "delivery_link_delivery_version_id_delivery_version_id_fk" FOREIGN KEY ("delivery_version_id") REFERENCES "public"."delivery_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_version" ADD CONSTRAINT "delivery_version_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_version" ADD CONSTRAINT "delivery_version_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_record" ADD CONSTRAINT "publication_record_content_item_channel_id_content_item_channel_id_fk" FOREIGN KEY ("content_item_channel_id") REFERENCES "public"."content_item_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_record" ADD CONSTRAINT "publication_record_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_event" ADD CONSTRAINT "security_audit_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feature_setting" ADD CONSTRAINT "ai_feature_setting_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feature_setting" ADD CONSTRAINT "ai_feature_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_slug_unique" ON "agency" USING btree (lower("slug"));--> statement-breakpoint
CREATE UNIQUE INDEX "agency_singleton_unique" ON "agency" USING btree ("singleton_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_membership_pk" ON "agency_membership" USING btree ("agency_id","user_id");--> statement-breakpoint
CREATE INDEX "agency_membership_user_idx" ON "agency_membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_unique" ON "user" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_token_hash_unique" ON "invitation" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitation_agency_email_idx" ON "invitation" USING btree ("agency_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_pending_unique" ON "invitation" USING btree ("agency_id","email") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_membership_pk" ON "workspace_membership" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_membership_user_idx" ON "workspace_membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_agency_slug_unique" ON "workspace" USING btree ("agency_id",lower("slug"));--> statement-breakpoint
CREATE INDEX "workspace_agency_idx" ON "workspace" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "brand_asset_workspace_idx" ON "brand_asset" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "brand_voice_workspace_idx" ON "brand_voice_rule" USING btree ("workspace_id","sort_order");--> statement-breakpoint
CREATE INDEX "social_channel_workspace_idx" ON "social_channel" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "social_channel_workspace_active_idx" ON "social_channel" USING btree ("workspace_id") WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX "campaign_workspace_idx" ON "campaign" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pillar_active_name_unique" ON "content_pillar" USING btree ("workspace_id",lower("name")) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX "pillar_workspace_idx" ON "content_pillar" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_active_name_unique" ON "content_template" USING btree ("workspace_id",lower("name")) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX "template_workspace_idx" ON "content_template" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "content_assignment_item_idx" ON "content_assignment" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "content_assignment_user_idx" ON "content_assignment" USING btree ("user_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "cic_pk" ON "content_item_channel" USING btree ("content_item_id","social_channel_id");--> statement-breakpoint
CREATE INDEX "cic_channel_override_idx" ON "content_item_channel" USING btree ("social_channel_id","planned_publish_at_override");--> statement-breakpoint
CREATE INDEX "content_item_workspace_planned_idx" ON "content_item" USING btree ("workspace_id","planned_publish_at");--> statement-breakpoint
CREATE INDEX "content_item_workspace_status_idx" ON "content_item" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "content_item_designer_status_idx" ON "content_item" USING btree ("designer_id","status") WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX "content_item_owner_status_idx" ON "content_item" USING btree ("content_owner_id","status") WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX "attachment_workspace_idx" ON "attachment" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "attachment_content_item_idx" ON "attachment" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "comment_item_created_idx" ON "comment" USING btree ("content_item_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_author_idx" ON "comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "approval_decision_request_idx" ON "approval_decision" USING btree ("approval_request_id");--> statement-breakpoint
CREATE INDEX "approval_request_item_status_idx" ON "approval_request" USING btree ("content_item_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_request_pending_unique" ON "approval_request" USING btree ("content_item_id","gate") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "delivery_link_version_idx" ON "delivery_link" USING btree ("delivery_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_version_unique" ON "delivery_version" USING btree ("content_item_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_record_channel_unique" ON "publication_record" USING btree ("content_item_channel_id");--> statement-breakpoint
CREATE INDEX "publication_record_status_idx" ON "publication_record" USING btree ("status");--> statement-breakpoint
CREATE INDEX "activity_event_workspace_created_idx" ON "activity_event" USING btree ("workspace_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "activity_event_content_item_idx" ON "activity_event" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "notification_user_read_created_idx" ON "notification" USING btree ("user_id","read_at","created_at" DESC);--> statement-breakpoint
CREATE INDEX "notification_workspace_idx" ON "notification" USING btree ("workspace_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "outbox_event" USING btree ("available_at") WHERE processed_at IS NULL;--> statement-breakpoint
CREATE INDEX "rate_limit_scope_subject_time_idx" ON "rate_limit_event" USING btree ("scope","subject_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "security_audit_actor_idx" ON "security_audit_event" USING btree ("actor_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "security_audit_action_idx" ON "security_audit_event" USING btree ("action","created_at" DESC);--> statement-breakpoint
CREATE INDEX "ai_usage_workspace_idx" ON "ai_usage_event" USING btree ("workspace_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "ai_usage_agency_idx" ON "ai_usage_event" USING btree ("agency_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage_event" USING btree ("user_id","created_at" DESC);