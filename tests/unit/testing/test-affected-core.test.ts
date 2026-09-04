import { describe, expect, it } from "vitest";
import {
  classifyChangedFiles,
  globToRegExp,
  validateOwnershipManifest,
  type TestOwnershipManifest,
} from "../../../scripts/test-affected-core";
import { buildManualClassification, parseAffectedArgs } from "../../../scripts/test-affected";

const manifest: TestOwnershipManifest = {
  unitSelection: {
    source: "vitest-related",
    directTest: "owned-files",
  },
  areas: [
    {
      id: "auth",
      sourceGlobs: ["src/lib/auth/**"],
      unitFiles: ["tests/unit/auth/**"],
      integrationFiles: ["tests/integration/auth/**"],
      browser: [{ spec: "tests/e2e/auth-gate.spec.ts", projects: ["chromium"] }],
    },
    {
      id: "content",
      sourceGlobs: ["src/lib/content/**"],
      unitFiles: ["tests/unit/content/**"],
      integrationFiles: ["tests/integration/journey.test.ts"],
      browser: [
        {
          spec: "tests/e2e/content-flow.spec.ts",
          projects: ["chromium"],
          grep: "Content: Quick Create",
        },
      ],
    },
  ],
  globalSourceGlobs: ["package.json", "src/app/globals.css"],
};

describe("test affected core", () => {
  it("matches recursive and single-segment globs without matching partial paths", () => {
    expect(globToRegExp("src/lib/auth/**").test("src/lib/auth/policy.ts")).toBe(true);
    expect(globToRegExp("src/lib/auth/**").test("src/lib/author.ts")).toBe(false);
    expect(globToRegExp("tests/unit/*.test.ts").test("tests/unit/auth.test.ts")).toBe(true);
    expect(globToRegExp("tests/unit/*.test.ts").test("tests/unit/auth/policy.test.ts")).toBe(false);
  });

  it("selects the owning area and its integration/browser contracts", () => {
    const result = classifyChangedFiles(["src/lib/content/service.ts"], manifest);

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toEqual(["content"]);
    expect(result.integrationFiles).toEqual(["tests/integration/journey.test.ts"]);
    expect(result.browser).toEqual([
      {
        spec: "tests/e2e/content-flow.spec.ts",
        projects: ["chromium"],
        grep: "Content: Quick Create",
      },
    ]);
  });

  it("escalates global changes to every layer", () => {
    const result = classifyChangedFiles(["src/app/globals.css"], manifest);

    expect(result.kind).toBe("escalated");
    expect(result.escalationReason).toContain("global");
    expect(result.runAllUnit).toBe(true);
    expect(result.runAllIntegration).toBe(true);
    expect(result.runAllBrowser).toBe(true);
  });

  it("escalates unknown code paths instead of silently selecting no tests", () => {
    const result = classifyChangedFiles(["src/lib/new-domain/service.ts"], manifest);

    expect(result.kind).toBe("escalated");
    expect(result.escalationReason).toContain("No ownership mapping");
    expect(result.runAllUnit).toBe(true);
    expect(result.runAllIntegration).toBe(true);
    expect(result.runAllBrowser).toBe(true);
  });

  it("treats documentation-only changes as an explicit no-test result", () => {
    const result = classifyChangedFiles(["docs/testing/strategy.md"], manifest);

    expect(result.kind).toBe("none");
    expect(result.reason).toContain("documentation");
  });

  it("deduplicates overlapping ownership and preserves stable ordering", () => {
    const result = classifyChangedFiles(
      ["src/lib/auth/policy.ts", "src/lib/auth/commands.ts"],
      manifest,
    );

    expect(result.areaIds).toEqual(["auth"]);
    expect(result.integrationFiles).toEqual(["tests/integration/auth/**"]);
    expect(result.browser).toHaveLength(1);
  });

  it("maps a changed test file to its owning area", () => {
    const result = classifyChangedFiles(["tests/unit/auth/policy.test.ts"], manifest);

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toEqual(["auth"]);
  });

  it("reports stale manifest paths before a command can run", () => {
    expect(
      validateOwnershipManifest(manifest, [
        "tests/unit/auth/policy.test.ts",
        "tests/integration/auth/user-creation.test.ts",
        "tests/e2e/auth-gate.spec.ts",
      ]),
    ).toEqual([
      "content: unit file pattern does not match any repository file: tests/unit/content/**",
      "content: integration file pattern does not match any repository file: tests/integration/journey.test.ts",
      "content: browser file pattern does not match any repository file: tests/e2e/content-flow.spec.ts",
    ]);
  });

  it("reports invalid projects and selectors before browser execution", () => {
    const browserManifest: TestOwnershipManifest = {
      ...manifest,
      areas: [
        {
          ...manifest.areas[1]!,
          browser: [
            {
              spec: "tests/e2e/content-flow.spec.ts",
              projects: ["not-a-playwright-project"],
              grep: "missing test title",
            },
          ],
        },
      ],
    };

    expect(
      validateOwnershipManifest(
        browserManifest,
        [
          "tests/unit/content/content.test.ts",
          "tests/integration/journey.test.ts",
          "tests/e2e/content-flow.spec.ts",
        ],
        { "tests/e2e/content-flow.spec.ts": 'test("Content: Quick Create", () => {})' },
      ),
    ).toEqual([
      "content: browser selection references unknown Playwright project: not-a-playwright-project",
      "content: browser grep does not match tests/e2e/content-flow.spec.ts: missing test title",
    ]);
  });

  it("parses the affected command options and rejects unknown layers", () => {
    expect(
      parseAffectedArgs(["--since", "origin/main", "--layer", "browser", "--coverage"]),
    ).toEqual({ since: "origin/main", layer: "browser", coverage: true, staged: false });
    expect(() => parseAffectedArgs(["--layer", "database"])).toThrow(
      "layer must be unit, integration, browser, or all",
    );
  });

  it("builds a manual area selection without requiring a Git diff", () => {
    const result = buildManualClassification("auth", manifest);

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toEqual(["auth"]);
    expect(result.integrationFiles).toEqual(["tests/integration/auth/**"]);
  });
});
