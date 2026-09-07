import { describe, expect, it } from "vitest";
import {
  buildEmptyMigrationReport,
  buildMigrationReport,
} from "../../scripts/migrate-local-uploads";

describe("legacy upload migration reports", () => {
  it("reports an absent legacy root as a successful empty inventory", () => {
    expect(buildEmptyMigrationReport({ dryRun: true, deleteLocal: false })).toEqual({
      ok: true,
      reportVersion: 1,
      dryRun: true,
      deleteLocal: false,
      sourcePresent: false,
      migrated: 0,
      skipped: 0,
      bytes: 0,
      localCleanupSkipped: 0,
      migratedByKind: {},
      skippedByReason: {},
      reason: "legacy_root_missing",
    });
  });

  it("preserves reconciliation counts and per-kind skip details", () => {
    expect(
      buildMigrationReport({
        dryRun: false,
        deleteLocal: true,
        sourcePresent: true,
        migrated: 3,
        skipped: 2,
        bytes: 4_096,
        localCleanupSkipped: 1,
        migratedByKind: { image: 2, video: 1, document: 0 },
        skippedByReason: { already_migrated: 1, unsupported_type: 1 },
      }),
    ).toEqual({
      ok: true,
      reportVersion: 1,
      dryRun: false,
      deleteLocal: true,
      sourcePresent: true,
      migrated: 3,
      skipped: 2,
      bytes: 4_096,
      localCleanupSkipped: 1,
      migratedByKind: { image: 2, video: 1, document: 0 },
      skippedByReason: { already_migrated: 1, unsupported_type: 1 },
    });
  });
});
