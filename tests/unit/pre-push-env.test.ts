import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HOOK_PATH = resolve(process.cwd(), ".husky/pre-push");
const DEFAULT_TEST_DATABASE_URL =
  "postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test";

function runHook(testDatabaseUrl?: string): string {
  const localSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  const remoteSha = execFileSync("git", ["rev-parse", "HEAD^"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  const env = { ...process.env };
  delete env.TEST_DATABASE_URL;
  delete env.CI;
  if (testDatabaseUrl !== undefined) env.TEST_DATABASE_URL = testDatabaseUrl;

  return execFileSync(
    "sh",
    [
      "-c",
      'pnpm() { printf "mock pnpm: %s; TEST_DATABASE_URL=%s\\n" "$*" "$TEST_DATABASE_URL"; }; . "$HOOK_PATH"',
    ],
    {
      cwd: process.cwd(),
      env: { ...env, HOOK_PATH: HOOK_PATH },
      input: `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`,
      encoding: "utf8",
    },
  );
}

describe("pre-push test database environment", () => {
  it("uses the safe local planner_test default when no override is exported", () => {
    const output = runHook();

    expect(output).toContain("using the local disposable planner_test database");
    expect(output).toContain(`TEST_DATABASE_URL=${DEFAULT_TEST_DATABASE_URL}`);
  });

  it("preserves an explicit disposable database override", () => {
    const override = "postgresql://planner:custom@127.0.0.1:5432/custom_test";
    const output = runHook(override);

    expect(output).not.toContain(DEFAULT_TEST_DATABASE_URL);
    expect(output).toContain(`TEST_DATABASE_URL=${override}`);
  });
});
