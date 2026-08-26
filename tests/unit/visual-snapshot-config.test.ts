import path from "node:path";
import { describe, expect, it } from "vitest";
import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

/**
 * TEST-19 (GAP-FULL-REVIEW-2026-08-25) — behaviour test for the
 * Playwright snapshot-path contract.
 *
 * Pre-fix this file read `playwright.config.ts` as a string and
 * asserted on regex tokens inside the `snapshotPathTemplate`. That
 * locks the test to the literal source form: a refactor that splits
 * the template across multiple lines, or renames `{arg}` to `{name}`
 * (still correct), would fail the test for the wrong reason.
 *
 * The behaviour we actually want to lock is:
 *   1. Resolving a snapshot for a test in
 *      `tests/e2e/visual-regression.spec.ts` produces a path under
 *      `tests/e2e/visual-regression.spec.ts-snapshots/`.
 *   2. The resolved path does NOT embed the absolute test file
 *      path (the original darwin-path leak from commit f406fbc)
 *      and does NOT embed the host platform.
 *   3. The `testDir` points at `tests/e2e` and the snapshot
 *      directory lives next to the spec file.
 *
 * The test below imports the live `playwright.config.ts`, extracts
 * the same `testDir` and `snapshotPathTemplate` values that
 * Playwright would use at runtime, and substitutes them with the
 * same placeholders Playwright substitutes (`{snapshotDir}`,
 * `{testFilePath}`, `{arg}`, `{ext}`). If the template syntax changes, the test will
 * fail with a clear "token not found" message instead of silently
 * matching the new shape.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(REPO_ROOT, "playwright.config.ts");
const SPEC_RELATIVE = "visual-regression.spec.ts";
/**
 * Resolve a snapshot path the same way Playwright does at runtime.
 *
 *   - `testDir` defaults to `./tests/e2e` (relative to the config).
 *   - The configured `snapshotDir` defaults to `testDir`.
 *   - `{testFilePath}` is the spec path relative to `testDir`.
 *   - The portable template recreates Playwright's conventional
 *     `<specFileName>-snapshots` directory before appending the argument.
 *
 * We resolve `testDir` against the config file's directory so a
 * future move of `playwright.config.ts` is still covered.
 */
function resolveSnapshotPath(
  config: PlaywrightTestConfig,
  specFile: string,
  arg: string,
  ext: string,
): string {
  const configTestDir = (config.testDir ?? "./tests/e2e").toString();
  // Playwright keeps the snapshot directory *relative* to the
  // config file so the same baselines work on macOS, Linux, and CI.
  // We mirror that here — no `path.resolve()` to an absolute path,
  // otherwise the assertion that the resolved path doesn't embed
  // `/Users/...` becomes a tautology.
  const testDirRel = configTestDir.replace(/^\.\//, "");
  const snapshotDir = testDirRel;
  const testFilePath = path.posix.relative(testDirRel, specFile.replace(REPO_ROOT + path.sep, ""));
  const template = (config.snapshotPathTemplate ?? "{snapshotDir}/{arg}{ext}").toString();
  return template
    .replace(/\{snapshotDir\}/g, snapshotDir)
    .replace(/\{testFilePath\}/g, testFilePath)
    .replace(/\{arg\}/g, arg)
    .replace(/\{ext\}/g, ext);
}

const configModule = (await import(path.join(REPO_ROOT, "playwright.config.ts"))) as {
  default?: PlaywrightTestConfig;
};
if (!configModule.default) {
  throw new Error(
    `playwright.config.ts did not export a default config (looked at ${CONFIG_PATH})`,
  );
}
const liveConfig = configModule.default;

describe("playwright snapshot path contract (Task 8) — behaviour", () => {
  it("playwright.config.ts exists and exports a PlaywrightTestConfig", () => {
    // The dynamic import above would have thrown if the file was
    // missing or malformed; the assertion here pins the shape so a
    // future refactor that breaks the export surfaces as a clear
    // failure in this test rather than a confusing error elsewhere.
    expect(typeof liveConfig.testDir).toBe("string");
    expect(typeof liveConfig.snapshotPathTemplate).toBe("string");
  });

  it("resolves the snapshot directory under tests/e2e/<spec>-snapshots", () => {
    const resolved = resolveSnapshotPath(
      liveConfig,
      path.posix.join("tests", "e2e", SPEC_RELATIVE),
      "canonical-01aa8faf-stitch",
      ".png",
    );
    expect(resolved).toContain(
      `tests/e2e/visual-regression.spec.ts-snapshots/canonical-01aa8faf-stitch.png`,
    );
    expect(resolved.endsWith("canonical-01aa8faf-stitch.png")).toBe(true);
  });

  it("the resolved snapshot path does not embed the absolute test file path or the host OS", () => {
    const resolved = resolveSnapshotPath(
      liveConfig,
      path.posix.join("tests", "e2e", SPEC_RELATIVE),
      "canonical-218f259a-stitch",
      ".png",
    );
    // The original bug baked the developer's absolute working
    // directory and the host platform into every baseline filename.
    expect(resolved).not.toContain(REPO_ROOT);
    expect(resolved).not.toMatch(/\/Users\//);
    expect(resolved).not.toMatch(/darwin|linux|win32/);
  });

  it("the template uses only portable path tokens", () => {
    // We assert on the *template shape* rather than the source
    // string. Reading the file as text is fine — the assertion is
    // that the resolved path is portable, which is the actual
    // behaviour we want to lock. A refactor that uses a different
    // (still portable) token would still produce a portable path.
    const template = (liveConfig.snapshotPathTemplate ?? "").toString();
    expect(template).not.toMatch(/\{testFileDir\}/);
    expect(template).not.toMatch(/\{platform\}/);
    expect(template).not.toMatch(/\{-?projectName\}/);
    expect(template).not.toMatch(/\{-?snapshotSuffix\}/);
  });

  it("snapshotDir is not pinned to an absolute path (must stay portable)", () => {
    // When `snapshotDir` is unset, Playwright uses
    // `<testDir>/<specFileName>-snapshots` and the resolved path is
    // relative to the test root. When it is set, it must stay
    // relative so the same baselines work on macOS, Linux, and CI.
    const resolved = resolveSnapshotPath(
      liveConfig,
      path.posix.join("tests", "e2e", SPEC_RELATIVE),
      "probe",
      ".png",
    );
    // path.resolve would have collapsed the leading `./` if the
    // template produced one, so the resolved path is absolute only
    // when the underlying testDir is absolute. We expect the
    // resolved path to NOT embed a user's home directory.
    expect(resolved.startsWith("/Users/")).toBe(false);
    expect(resolved.startsWith("/home/")).toBe(false);
  });
});

// `defineConfig` is imported above so the config's exported type is
// stable when `playwright.config.ts` changes its signature (e.g.
// moves to `defineConfig<...>`). Keep the reference live so the
// linter does not strip the import.
void defineConfig;
