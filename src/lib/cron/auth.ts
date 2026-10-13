import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/validation/env";

/**
 * Compare two cron secrets without leaking their length or contents through
 * an ordinary string comparison. The explicit secret parameter keeps this
 * seam unit-testable while production callers default to the server secret.
 */
export function secretsMatch(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (presentedBytes.length !== expectedBytes.length) {
    // Keep a constant-time operation on the presented bytes even when the
    // lengths differ; timingSafeEqual itself requires equal lengths.
    timingSafeEqual(presentedBytes, presentedBytes);
    return false;
  }
  return timingSafeEqual(presentedBytes, expectedBytes);
}

/** Validate the standard `Authorization: Bearer <CRON_SECRET>` contract. */
export function isCronAuthorized(
  headers: Pick<Headers, "get">,
  expectedSecret = serverEnv.CRON_SECRET,
): boolean {
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !expectedSecret) return false;
  return secretsMatch(authorization.slice("Bearer ".length).trim(), expectedSecret);
}
