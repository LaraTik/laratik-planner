import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

/**
 * M4.5.7 — KEK rotation script argument parsing.
 *
 * The script (`scripts/rotate-social-kek.ts`) has well-defined
 * behavior for invalid input. We import the parsing helper
 * indirectly by spawning a child process — this is the
 * closest thing to a true integration test we can do without
 * a live DB. The pure-crypto surface (wrap / unwrap DEK) is
 * already covered by tests/unit/social-key-management.test.ts.
 *
 * The child-process approach is intentional: it verifies the
 * exact CLI surface the operator will see.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/rotate-social-kek.ts");

function runScript(
  args: string[],
  env: Record<string, string | undefined> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("pnpm", ["tsx", SCRIPT_PATH, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...env } as NodeJS.ProcessEnv,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("rotate-social-kek CLI", () => {
  beforeEach(() => {
    // Ensure DATABASE_URL is unset so the script will not try to
    // connect to a real DB during the CLI-arg tests. The DB
    // connection happens AFTER argument parsing succeeds, so
    // missing-URL failures only surface on a valid arg set.
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exists and is executable via tsx", () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
  });

  it("--help exits 0 and prints usage", () => {
    const result = runScript(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  it("exits 1 when --new-kek is missing", () => {
    const result = runScript(["--old-kek", randomBytes(32).toString("base64")]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--new-kek is required");
  });

  it("exits 1 when both keys are missing", () => {
    const result = runScript([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--old-kek|--new-kek/);
  });

  it("exits 1 when --new-kek does not decode to 32 bytes", () => {
    const oldKek = randomBytes(32).toString("base64");
    const result = runScript([
      "--old-kek",
      oldKek,
      "--new-kek",
      randomBytes(16).toString("base64"),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--new-kek must decode to 32 bytes");
  });

  it("exits 1 when --old-kek and --new-kek are identical", () => {
    const kek = randomBytes(32).toString("base64");
    const result = runScript(["--old-kek", kek, "--new-kek", kek]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("identical");
  });

  it("exits 1 on an unknown flag", () => {
    const result = runScript(["--bogus"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown argument");
  });

  it("valid args print fingerprints and reach the DB (fails there without DATABASE_URL)", () => {
    const oldKek = randomBytes(32).toString("base64");
    const newKek = randomBytes(32).toString("base64");
    // Set a syntactically-valid but unreachable DATABASE_URL so
    // the env validator passes. SKIP_ENV_VALIDATION would also
    // work, but a valid URL is closer to the production path.
    const result = runScript(["--old-kek", oldKek, "--new-kek", newKek], {
      DATABASE_URL: "postgresql://placeholder@127.0.0.1:1/placeholder",
    });
    // Either the DB is reachable (exit 0) or it fails with a
    // Drizzle / pg error (non-zero, but the CLI-arg validation
    // passed and the script reached `main`). The script writes
    // fingerprints to stdout and the DB error to stderr; combine
    // both to assert the script reached `main`.
    const combined = result.stdout + result.stderr;
    expect(combined).toContain("old KEK fingerprint");
    expect(combined).toContain("new KEK fingerprint");
  });
});
