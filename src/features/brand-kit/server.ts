import "server-only";

import { logError } from "@/lib/observability/logger";

export function logBrandKitActionFailure(event: string, error: unknown): void {
  logError(event, { err: error });
}

export {
  colorTemplates,
  pillarTemplates,
  publishingTemplates,
  typographyTemplates,
  voiceTemplates,
  type ColorTemplate,
  type PillarTemplate,
  type PublishingTemplate,
  type TypographyTemplate,
  type VoiceRuleTemplate,
} from "./templates";
