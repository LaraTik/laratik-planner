#!/usr/bin/env tsx
/**
 * Rotate the platform KEK (M4.5.7 — KEK rotation).
 *
 * Re-wraps every `agency_social_dek` row from the OLD KEK to the
 * NEW KEK. Tokens sealed with each agency's DEK are NOT touched —
 * only the per-agency DEK envelope is re-bound. This is the
 * single most important operational script for the social
 * feature: losing the KEK without a successful rotation locks
 * every agency out of their social connections.
 *
 * Usage:
 *
 *   pnpm tsx scripts/rotate-social-kek.ts \
 *     --new-kek "$(openssl rand -base64 32)"
 *
 *   # Dry run (no DB writes):
 *   pnpm tsx scripts/rotate-social-kek.ts \
 *     --new-kek "$(openssl rand -base64 32)" --dry-run
 *
 *   # Custom old KEK (defaults to $SOCIAL_TOKEN_ENCRYPTION_KEY):
 *   pnpm tsx scripts/rotate-social-kek.ts \
 *     --old-kek "$OLD_KEK" \
 *     --new-kek "$NEW_KEK"
 *
 * Exit codes:
 *   0 — rotation succeeded (or dry-run completed)
 *   1 — operator error (bad args, missing env, malformed key)
 *   2 — rotation failed: at least one row could not be re-wrapped
 *
 * After a successful run, the operator:
 *   1. Updates SOCIAL_TOKEN_ENCRYPTION_KEY on the platform to the
 *      new value.
 *   2. Restarts the application so the new KEK takes effect.
 *   3. (Optional) Verifies by checking that /api/cron/social-metrics
 *      returns `kekStatus: "ok"` on the next tick.
 *
 * Safety:
 *   - The script refuses to run unless BOTH old and new KEK are
 *     exactly 32 bytes after base64 decode.
 *   - The script refuses to run if old == new (no-op).
 *   - In dry-run mode, the DB is NOT modified.
 *   - The script prints the KEK fingerprints (sha256, last 4 bytes
 *     hex) before / after, so the operator can confirm the swap.
 *   - Re-wrap is per-agency in a transaction; one bad row does not
 *     roll back successful re-wraps.
 */

import { createHash } from "node:crypto";
import { rewrapAllDeksForKekRotation } from "../src/lib/social/key-management";
import { db } from "../src/lib/db";

type CliArgs = {
  oldKek: Buffer;
  newKek: Buffer;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  let oldKekB64 = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY ?? "";
  let newKekB64 = "";
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--old-kek") {
      oldKekB64 = argv[++i] ?? "";
    } else if (arg === "--new-kek") {
      newKekB64 = argv[++i] ?? "";
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  if (!oldKekB64) {
    console.error(
      "FATAL: --old-kek is required (or set SOCIAL_TOKEN_ENCRYPTION_KEY in the environment).",
    );
    process.exit(1);
  }
  if (!newKekB64) {
    console.error("FATAL: --new-kek is required.");
    process.exit(1);
  }

  const oldKek = decodeKek(oldKekB64, "--old-kek");
  const newKek = decodeKek(newKekB64, "--new-kek");
  if (oldKek.equals(newKek)) {
    console.error("FATAL: --old-kek and --new-kek are identical. Refusing to no-op rotate.");
    process.exit(1);
  }
  return { oldKek, newKek, dryRun };
}

function decodeKek(b64: string, name: string): Buffer {
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    console.error(`FATAL: ${name} must decode to 32 bytes (got ${buf.length}).`);
    process.exit(1);
  }
  return buf;
}

function fingerprint(kek: Buffer): string {
  return createHash("sha256").update(kek).digest("hex").slice(-8);
}

function printUsage(): void {
  console.log(
    `Usage: pnpm tsx scripts/rotate-social-kek.ts --new-kek "<base64-32-bytes>" [--old-kek "<base64-32-bytes>"] [--dry-run]`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const oldFp = fingerprint(args.oldKek);
  const newFp = fingerprint(args.newKek);

  console.log("[rotate-social-kek] start");
  console.log(`[rotate-social-kek] old KEK fingerprint: ${oldFp}`);
  console.log(`[rotate-social-kek] new KEK fingerprint: ${newFp}`);
  if (args.dryRun) {
    console.log("[rotate-social-kek] dry-run mode: no DB writes will be performed");
  }

  const result = await rewrapAllDeksForKekRotation(db, {
    oldKek: args.oldKek,
    newKek: args.newKek,
    dryRun: args.dryRun,
  });

  console.log(
    `[rotate-social-kek] scanned ${result.total} agency_social_dek rows; ok=${result.ok}, failed=${result.failed}`,
  );

  if (result.failed > 0) {
    console.error(
      `[rotate-social-kek] ${result.failed} row(s) could not be re-wrapped. ` +
        `The old KEK may not match the envelope (someone rotated the env var without running this script, or the row is corrupted).`,
    );
    process.exit(2);
  }

  if (result.total === 0) {
    console.log("[rotate-social-kek] no agency has enabled social; nothing to do.");
  } else {
    console.log("[rotate-social-kek] done. Next steps:");
    console.log("  1. Update SOCIAL_TOKEN_ENCRYPTION_KEY on the platform to the new value.");
    console.log("  2. Restart the application so the new KEK takes effect.");
    console.log("  3. Verify with: curl -sH 'Authorization: Bearer $CRON_SECRET' \\");
    console.log("       https://planner.laratik.com/api/cron/social-metrics");
    console.log('     (look for `kekStatus: "ok"`).');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[rotate-social-kek] FATAL:", err);
  process.exit(1);
});
