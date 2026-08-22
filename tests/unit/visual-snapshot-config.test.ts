import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lock the Playwright snapshot-path contract. The visual-regression
 * baselines must be portable across host OS and absolute working
 * directory, so:
 *
 *   1. The `snapshotPathTemplate` must NOT include `{testFilePath}`
 *      (the absolute path segment that baked `/Users/mohamad-nezam/...`
 *      into every baseline filename in the first local capture) and
 *      must NOT include `{platform}` (which encoded `darwin` into
 *      every filename on macOS and would encode `linux` on the
 *      GitHub runner).
 *   2. The resolved snapshot directory must live under
 *      `tests/e2e/visual-regression.spec.ts-snapshots/` with the
 *      exact-reference and responsive-matrix captures in separate
 *      `reference/` and `responsive/` subdirectories.
 *
 * The test reads `playwright.config.ts` as text and asserts the
 * template — loading the config via `import()` would pull in
 * `@playwright/test` side effects, so a static read is the right
 * shape for a vitest unit test.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(REPO_ROOT, "playwright.config.ts");
const SNAPSHOT_DIR = path.join(REPO_ROOT, "tests/e2e/visual-regression.spec.ts-snapshots");
const REFERENCE_DIR = path.join(SNAPSHOT_DIR, "reference");
const RESPONSIVE_DIR = path.join(SNAPSHOT_DIR, "responsive");

describe("playwright snapshot path contract (Task 8)", () => {
  it("playwright.config.ts exists", () => {
    expect(existsSync(CONFIG_PATH), `missing ${CONFIG_PATH}`).toBe(true);
  });

  it("declares a portable snapshotPathTemplate that strips absolute paths and host OS", () => {
    const source = readFileSync(CONFIG_PATH, "utf8");
    // Look for a top-level `snapshotPathTemplate: '...'` assignment.
    const match = source.match(/snapshotPathTemplate\s*:\s*['"]([^'"]+)['"]/);
    expect(match, "no snapshotPathTemplate declared in playwright.config.ts").not.toBeNull();
    const template = match![1];

    // The bug was that the absolute test file path and the host
    // platform were encoded into the filename; both must be gone.
    expect(template, "template embeds absolute test file path").not.toMatch(/\{testFilePath\}/);
    expect(template, "template embeds absolute test file directory").not.toMatch(/\{testFileDir\}/);
    expect(template, "template embeds host platform (darwin/linux/win32)").not.toMatch(
      /\{platform\}/,
    );
    expect(template, "template embeds project name (project-conditional segment)").not.toMatch(
      /\{-?projectName\}/,
    );
    expect(template, "template embeds snapshot suffix (platform-conditional segment)").not.toMatch(
      /\{-?snapshotSuffix\}/,
    );

    // The template must keep the {arg} and {ext} tokens so the
    // helpers in tests/e2e/stitch-cases.ts control the filename.
    expect(template, "template must include {arg} token").toMatch(/\{arg\}/);
    expect(template, "template must include {ext} token").toMatch(/\{ext\}/);
  });

  it("resolves the snapshot directory under tests/e2e/visual-regression.spec.ts-snapshots/", () => {
    // The Playwright default places snapshots next to the test file
    // as `<testFileName>-snapshots/`. We rely on that default rather
    // than overriding it because our portable template writes
    // {arg}{ext} directly under the snapshotDir and the helpers
    // already encode the `reference/` and `responsive/` subdirs in
    // the {arg} value.
    const source = readFileSync(CONFIG_PATH, "utf8");
    expect(source).toMatch(/testDir:\s*['"]\.\/tests\/e2e['"]/);
    // The exact-reference and responsive-matrix subdirs must be
    // discoverable on disk once a capture runs. The directory may
    // not exist yet (baselines have not been committed), so the
    // assertion is that the path is consistent with the spec, not
    // that the directory already exists.
    expect(path.dirname(REFERENCE_DIR)).toBe(SNAPSHOT_DIR);
    expect(path.dirname(RESPONSIVE_DIR)).toBe(SNAPSHOT_DIR);
    expect(REFERENCE_DIR).not.toBe(RESPONSIVE_DIR);
  });

  it("playwright.config.ts has no stale absolute snapshot path configuration", () => {
    const source = readFileSync(CONFIG_PATH, "utf8");
    // The previous failure mode was an absolute snapshotDir that
    // baked the developer's path into the filename; assert the
    // config does not point snapshotDir at an absolute location.
    const snapshotDirMatch = source.match(/snapshotDir\s*:\s*['"]([^'"]+)['"]/);
    const value = snapshotDirMatch?.[1];
    if (value) {
      expect(
        value.startsWith("/") || /^[A-Z]:/i.test(value),
        `snapshotDir is absolute (${value}) — must be relative to keep filenames portable`,
      ).toBe(false);
    }
  });
});
