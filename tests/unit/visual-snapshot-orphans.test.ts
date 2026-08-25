import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TEST-20 (GAP-FULL-REVIEW-2026-08-25) — orphan-snapshot guard.
 *
 * The P1 sweep (commit 7b1ae8a → f406fbc) cleaned up ~122 darwin-
 * path orphans in this directory. To keep the cleanup from
 * silently regressing, this file scans the snapshot directory and
 * asserts that the only top-level entries are `reference/` and
 * `responsive/` — the two subdirectories that the visual-regression
 * spec actually writes to.
 *
 * If a future capture run writes a stray file (e.g. the
 * `snapshotPathTemplate` regresses and a `-darwin.png` orphan
 * appears), this test fails loud. The `.gitignore` rule that
 * ignores `tests/e2e/visual-regression.spec.ts-snapshots/*` and
 * re-allows `reference/` and `responsive/` keeps orphans out of
 * the repo even if the test is ever disabled; this test is the
 * contract, the gitignore is the safety net.
 */
describe("visual-regression snapshot directory has no orphans (TEST-20)", () => {
  const SNAPSHOT_DIR = path.resolve(__dirname, "..", "e2e", "visual-regression.spec.ts-snapshots");

  it("the snapshot directory exists and is readable", () => {
    const stat = statSync(SNAPSHOT_DIR);
    expect(stat.isDirectory()).toBe(true);
  });

  it("only contains `reference/` and `responsive/` at the top level", () => {
    const entries = readdirSync(SNAPSHOT_DIR).sort();
    expect(entries).toEqual(["reference", "responsive"]);
  });

  it("no top-level orphan files (e.g. `-darwin.png`, `-Users-...-spec.png`)", () => {
    const entries = readdirSync(SNAPSHOT_DIR);
    const fileEntries = entries.filter((name) => {
      const full = path.join(SNAPSHOT_DIR, name);
      return statSync(full).isFile();
    });
    expect(fileEntries).toEqual([]);
  });
});
