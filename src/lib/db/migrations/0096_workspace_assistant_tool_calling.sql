ALTER TABLE "ai_feature_setting" ADD COLUMN IF NOT EXISTS "tool_calling_enabled" boolean DEFAULT false NOT NULL;
