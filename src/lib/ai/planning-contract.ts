import { z } from "zod";

export const PlanningPackModeSchema = z.enum(["global", "discovery", "strategy", "execution"]);
export const PlanningPackStageSchema = z.enum([
  "all",
  "inputs",
  "questions",
  "directions",
  "structure",
  "content_mix",
  "calendar",
  "production",
  "paid",
  "copy",
  "quality",
  "governance",
  "output",
  "review",
]);

export const PlanningInstructionPackManifestSchema = z.object({
  manifestVersion: z.literal(1),
  packId: z.string().min(1).max(120),
  packVersion: z.number().int().positive(),
  sourceDocuments: z.array(
    z.object({
      file: z.string().min(1).max(200),
      mode: PlanningPackModeSchema,
      stage: PlanningPackStageSchema,
    }),
  ),
  requiredInputs: z.array(z.string().min(1).max(120)).max(100),
  blockingQuestions: z.array(z.string().min(1).max(1000)).max(50),
  decisionRules: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  qualityChecks: z.array(z.string().min(1).max(160)).max(100),
  riskHandling: z.record(z.unknown()),
  languageBehavior: z.record(z.unknown()),
});

export type PlanningInstructionPackManifest = z.infer<typeof PlanningInstructionPackManifestSchema>;

export const PlanningInstructionPackStatusSchema = z.enum(["draft", "published"]);
export type PlanningInstructionPackStatus = z.infer<typeof PlanningInstructionPackStatusSchema>;
