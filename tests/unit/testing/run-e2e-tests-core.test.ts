import { describe, expect, it } from "vitest";
import {
  ISOLATED_PLAYWRIGHT_PROJECTS,
  planPlaywrightInvocations,
} from "../../../scripts/run-e2e-tests-core";

describe("isolated Playwright project plan", () => {
  it("runs each project in its own invocation for the full suite", () => {
    expect(planPlaywrightInvocations(["--workers=1"])).toEqual(
      ISOLATED_PLAYWRIGHT_PROJECTS.map((project) => ["--workers=1", `--project=${project}`]),
    );
  });

  it("keeps an explicitly selected project in a single invocation", () => {
    expect(
      planPlaywrightInvocations(["--workers=1", "--project=webkit", "tests/e2e/public.spec.ts"]),
    ).toEqual([["--workers=1", "--project=webkit", "tests/e2e/public.spec.ts"]]);
  });

  it("supports Playwright's separated project option", () => {
    expect(planPlaywrightInvocations(["--project", "firefox", "tests/e2e/public.spec.ts"])).toEqual(
      [["--project", "firefox", "tests/e2e/public.spec.ts"]],
    );
  });
});
