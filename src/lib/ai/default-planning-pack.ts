import canonicalManifest from "../../../docs/ai-planning/defaults/manifest.json";
import { PlanningInstructionPackManifestSchema } from "./planning-contract";

export const CANONICAL_PLANNING_PACK = {
  manifest: PlanningInstructionPackManifestSchema.parse(canonicalManifest),
  precedence: "canonical → agency published → workspace published → monthly overrides",
  sourceSummary:
    "Ask before generating; separate facts, missing information, suggestions, and assumptions; make mode transitions explicit; build objective → campaign → pillars → mix → calendar → production; check repetition, CTA clarity, production realism, AI suitability, paid fit, language fit, and strategic consistency.",
} as const;
