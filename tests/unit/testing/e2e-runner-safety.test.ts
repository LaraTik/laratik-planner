import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("isolated E2E database guard", () => {
  it("rejects a non-test database before starting migrations or Playwright", () => {
    const result = spawnSync("pnpm", ["exec", "tsx", "scripts/run-e2e-tests.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TEST_DATABASE_URL: "postgresql://planner:planner_dev_only@127.0.0.1:5432/planner",
      },
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to run destructive browser tests against a URL without 'test' or 'ci'.",
    );
  });
});
