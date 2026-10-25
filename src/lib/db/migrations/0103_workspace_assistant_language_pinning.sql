ALTER TABLE "workspace_assistant_conversation"
  ADD COLUMN "response_locale" text NOT NULL DEFAULT 'ar',
  ADD COLUMN "pinned_at" timestamp with time zone;

ALTER TABLE "workspace_assistant_conversation"
  ADD CONSTRAINT "workspace_assistant_conversation_response_locale_valid"
  CHECK ("response_locale" IN ('ar', 'en'));
