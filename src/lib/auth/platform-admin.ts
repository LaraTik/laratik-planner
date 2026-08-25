import "server-only";
import type { Actor } from "@/lib/auth/policy";
import {
  hasPlatformPermission,
  requirePlatformPermission,
} from "@/lib/auth/platform-access";

/**
 * Compatibility helpers for callers that only need platform-console entry.
 * New authorization decisions must request their exact permission through
 * `platform-access.ts`; neither helper grants tenant content access.
 */
export async function isPlatformAdmin(actor: Actor): Promise<boolean> {
  return hasPlatformPermission(actor, "platform.console.read");
}

/** Require the exact permission that permits entry to the platform console. */
export async function requirePlatformAdmin(actor: Actor): Promise<void> {
  await requirePlatformPermission(actor, "platform.console.read");
}
