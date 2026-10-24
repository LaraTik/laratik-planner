import { AgencyUpdateError } from "@/lib/agencies/command";
import { logError } from "@/lib/observability/logger";

export type AgencyUpdateActionFailure = { error: string; code?: string };

/** Map agency update failures once for both platform and agency actions. */
export function agencyUpdateActionFailure(
  error: unknown,
  event: string,
): AgencyUpdateActionFailure {
  if (error instanceof AgencyUpdateError) {
    return { error: error.message, code: error.code };
  }
  logError(event, { err: error });
  return { error: "Could not save the agency settings." };
}
