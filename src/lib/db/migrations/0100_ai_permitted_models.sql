ALTER TABLE "ai_feature_setting" ADD COLUMN "permitted_models" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
UPDATE "ai_feature_setting" SET "permitted_models" = ARRAY["model"] WHERE cardinality("permitted_models") = 0;
