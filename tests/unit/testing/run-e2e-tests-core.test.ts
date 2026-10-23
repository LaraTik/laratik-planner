import { describe, expect, it } from "vitest";
import {
  ISOLATED_E2E_DISABLE_DEV_MEMORY_RESTART,
  ISOLATED_PLAYWRIGHT_PROJECTS,
  isolatedE2eNodeOptions,
  planPlaywrightInvocations,
  shouldDisableIsolatedE2eMemoryRestart,
} from "../../../scripts/run-e2e-tests-core";

describe("isolated Playwright project plan", () => {
  it("provides a runner-only switch for Next dev memory restarts on large local hosts", () => {
    expect(ISOLATED_E2E_DISABLE_DEV_MEMORY_RESTART).toBe("LARATIK_E2E_DISABLE_DEV_MEMORY_RESTART");
    expect(
      shouldDisableIsolatedE2eMemoryRestart({
        ci: false,
        hostMemoryBytes: 48 * 1024 ** 3,
      }),
    ).toBe(true);
    expect(
      shouldDisableIsolatedE2eMemoryRestart({
        ci: true,
        hostMemoryBytes: 48 * 1024 ** 3,
      }),
    ).toBe(false);
    expect(
      shouldDisableIsolatedE2eMemoryRestart({
        ci: false,
        hostMemoryBytes: 16 * 1024 ** 3,
      }),
    ).toBe(false);
  });

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

describe("isolated E2E Node heap", () => {
  it("raises the heap limit on a large local host so Next dev avoids premature restart", () => {
    expect(
      isolatedE2eNodeOptions({
        ci: false,
        hostMemoryBytes: 48 * 1024 ** 3,
      }),
    ).toBe("--max-old-space-size=8192");
  });

  it("keeps the default heap limit on CI and lower-memory hosts", () => {
    expect(
      isolatedE2eNodeOptions({
        ci: true,
        hostMemoryBytes: 48 * 1024 ** 3,
      }),
    ).toBeUndefined();
    expect(
      isolatedE2eNodeOptions({
        ci: false,
        hostMemoryBytes: 16 * 1024 ** 3,
      }),
    ).toBeUndefined();
  });

  it("preserves an existing Node heap option and accepts an explicit override", () => {
    expect(
      isolatedE2eNodeOptions({
        current: "--trace-warnings --max-old-space-size=4096",
        ci: false,
        hostMemoryBytes: 48 * 1024 ** 3,
      }),
    ).toBe("--trace-warnings --max-old-space-size=4096");
    expect(
      isolatedE2eNodeOptions({
        current: "--trace-warnings",
        ci: true,
        hostMemoryBytes: 8 * 1024 ** 3,
        requestedHeapMb: "6144",
      }),
    ).toBe("--trace-warnings --max-old-space-size=6144");
  });

  it("rejects invalid explicit heap settings", () => {
    expect(() =>
      isolatedE2eNodeOptions({
        ci: false,
        hostMemoryBytes: 48 * 1024 ** 3,
        requestedHeapMb: "large",
      }),
    ).toThrow("LARATIK_E2E_MAX_OLD_SPACE_SIZE must be a positive integer in MiB.");
    expect(() =>
      isolatedE2eNodeOptions({
        ci: false,
        hostMemoryBytes: 8 * 1024 ** 3,
        requestedHeapMb: "512",
      }),
    ).toThrow("LARATIK_E2E_MAX_OLD_SPACE_SIZE must be at least 1024 MiB.");
  });
});
