ALTER TABLE "workspace_assistant_prompt" ALTER COLUMN "parameters" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
UPDATE "workspace_assistant_prompt" SET "parameters" = '[]'::jsonb WHERE jsonb_typeof("parameters") <> 'array';--> statement-breakpoint
ALTER TABLE "workspace_assistant_prompt" ADD CONSTRAINT "workspace_assistant_prompt_parameters_array" CHECK (jsonb_typeof("workspace_assistant_prompt"."parameters") = 'array');
