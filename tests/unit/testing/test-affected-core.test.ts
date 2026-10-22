import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  classifyChangedFiles,
  globToRegExp,
  validateOwnershipManifest,
  type TestOwnershipManifest,
} from "../../../scripts/test-affected-core";
import {
  buildManualClassification,
  parseAffectedArgs,
  parsePushRanges,
  selectedBrowserArgs,
} from "../../../scripts/test-affected";
import { TEST_OWNERSHIP } from "../../../scripts/test-ownership";

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
  it("uses the canonical section-title utility backed by the design token", () => {
    const sourceRoot = join(process.cwd(), "src");
    const collectSourceFiles = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(path);
        return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
      });
    const staleUtilityFiles = collectSourceFiles(sourceRoot).filter((path) =>
      readFileSync(path, "utf8").includes("text-section-title"),
    );
    const theme = readFileSync(join(sourceRoot, "app/globals.css"), "utf8");

    expect(staleUtilityFiles).toEqual([]);
    expect(theme).toContain("--text-title-section:");
  });

  it("maps every App Router page to browser tests and inherited loading/error boundaries", () => {
    const appRoot = join(process.cwd(), "src/app");
    const collectPages = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? collectPages(path)
          : entry.name === "page.tsx"
            ? [relative(process.cwd(), path)]
            : [];
      });

    const unmapped = collectPages(appRoot).flatMap((sourcePath) => {
      const result = classifyChangedFiles([sourcePath], TEST_OWNERSHIP);
      const hasBoundary = (name: "loading.tsx" | "error.tsx") => {
        let directory = join(process.cwd(), dirname(sourcePath));
        while (directory.startsWith(appRoot)) {
          if (existsSync(join(directory, name))) return true;
          directory = dirname(directory);
        }
        return false;
      };
      return result.kind === "targeted" &&
        result.browser.length > 0 &&
        hasBoundary("loading.tsx") &&
        hasBoundary("error.tsx")
        ? []
        : [{ sourcePath, result }];
    });

    expect(unmapped).toEqual([]);
  });

  it("validates ownership-manifest edits with the focused architecture unit area", () => {
    const result = classifyChangedFiles(["scripts/test-ownership.ts"], TEST_OWNERSHIP);

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toEqual(["architecture"]);
    expect(result.unitFiles).toContain("tests/unit/testing/test-affected-core.test.ts");
    expect(result.runAllIntegration).toBe(false);
    expect(result.runAllBrowser).toBe(false);
  });

  it("keeps isolated E2E runner changes in the focused architecture area", () => {
    const result = classifyChangedFiles(["scripts/run-e2e-tests.ts"], TEST_OWNERSHIP);

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toEqual(["architecture"]);
    expect(result.unitFiles).toContain("tests/unit/testing/run-e2e-tests-core.test.ts");
    expect(result.integrationFiles).toEqual([]);
    expect(result.runAllIntegration).toBe(false);
    expect(result.runAllBrowser).toBe(false);
  });

  it("maps canonical agency-qualified workspace routes to their feature areas", () => {
    const cases = [
      ["src/app/(app)/app/a/[agencySlug]/w/[slug]/planning/new/page.tsx", "content"],
      [
        "src/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/publish/publish-package-form.tsx",
        "publishing",
      ],
      ["src/app/(app)/app/a/[agencySlug]/w/[slug]/page.tsx", "workspace"],
      ["src/app/(app)/app/a/[agencySlug]/w/[slug]/settings/page.tsx", "workspace-pages"],
      ["src/app/(app)/app/a/[agencySlug]/w/[slug]/brand-kit/page.tsx", "brand-kit"],
      ["src/app/(app)/app/a/[agencySlug]/w/[slug]/channels/page.tsx", "channels-social"],
      ["src/app/(app)/app/a/[agencySlug]/w/[slug]/analytics/social/page.tsx", "channels-social"],
      ["src/app/api/social/providers/analytics-test/route.ts", "channels-social"],
      ["src/app/(app)/app/a/[agencySlug]/w/[slug]/ai-settings/page.tsx", "ai"],
      ["src/app/api/ai/monthly-planning/route.ts", "ai"],
      ["src/app/api/community/test-lab/route.ts", "ai"],
      [
        "src/app/(app)/app/a/[agencySlug]/w/[slug]/planning/[id]/workspace-shell.tsx",
        "notifications-discussions",
      ],
      [
        "tests/e2e/visual-regression.spec.ts-snapshots/responsive/app-w-acme-settings-defaults-mobile-s.png",
        "visual-regression",
      ],
    ] as const;

    for (const [sourcePath, expectedArea] of cases) {
      const result = classifyChangedFiles([sourcePath], TEST_OWNERSHIP);
      expect(result.kind, sourcePath).toBe("targeted");
      expect(result.areaIds, sourcePath).toContain(expectedArea);
    }
  });

  it("selects the workspace settings deadline regression for settings-route changes", () => {
    const result = classifyChangedFiles(
      ["src/app/(app)/app/a/[agencySlug]/w/[slug]/settings/page.tsx"],
      TEST_OWNERSHIP,
    );

    expect(result.kind).toBe("targeted");
    expect(result.unitFiles).toContain("tests/unit/workspace-settings/**");
    expect(result.runAllUnit).toBe(false);

    const directTestFile = classifyChangedFiles(
      ["tests/unit/workspace-settings/lead-times-form.test.tsx"],
      TEST_OWNERSHIP,
    );
    expect(directTestFile.kind).toBe("targeted");
    expect(directTestFile.areaIds).toContain("workspace-pages");
    expect(directTestFile.runAllUnit).toBe(false);
  });

  it("selects bilingual browser coverage for agency support review changes", () => {
    const result = classifyChangedFiles(
      ["src/app/(app)/app/agency-settings/plan/support/page.tsx"],
      TEST_OWNERSHIP,
    );

    expect(result.kind).toBe("targeted");
    expect(result.browser).toContainEqual({
      spec: "tests/e2e/locale-rtl.spec.ts",
      projects: ["chromium"],
      grep: "agency support request review",
    });
    expect(result.runAllBrowser).toBe(false);
  });

  it("selects monthly proposal transaction coverage for AI route changes", () => {
    const result = classifyChangedFiles(
      ["src/app/api/ai/monthly-planning/route.ts"],
      TEST_OWNERSHIP,
    );

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toContain("ai");
    expect(result.integrationFiles).toContain("tests/integration/monthly-planning-apply.test.ts");

    const directTest = classifyChangedFiles(
      ["tests/integration/monthly-planning-apply.test.ts"],
      TEST_OWNERSHIP,
    );
    expect(directTest.kind).toBe("targeted");
    expect(directTest.areaIds).toContain("ai");
  });

  it("selects AI and Community Test Lab units for the shared budget route", () => {
    const result = classifyChangedFiles(
      ["src/app/api/community/test-lab/route.ts"],
      TEST_OWNERSHIP,
    );

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toContain("ai");
    expect(result.unitFiles).toContain("tests/unit/community-test-lab-route.test.ts");
  });

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

  it("maps the password-reset feature to its focused auth checks", () => {
    const result = classifyChangedFiles(["src/features/auth/server.ts"], TEST_OWNERSHIP);

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toContain("auth");
    expect(result.unitFiles).toContain("tests/unit/auth/**");
    expect(result.browser).toContainEqual(
      expect.objectContaining({ spec: "tests/e2e/password-reset-enumeration.spec.ts" }),
    );
  });

  it("maps a changed test file to its owning area", () => {
    const result = classifyChangedFiles(["tests/unit/auth/policy.test.ts"], manifest);

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toEqual(["auth"]);
  });

  it("escalates an unmapped changed test even when another changed file has an owner", () => {
    const result = classifyChangedFiles(
      ["src/lib/content/service.ts", "tests/e2e/unmapped.spec.ts"],
      manifest,
    );

    expect(result.kind).toBe("escalated");
    expect(result.escalationReason).toContain("tests/e2e/unmapped.spec.ts");
    expect(result.runAllBrowser).toBe(true);
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
    ).toEqual({
      since: "origin/main",
      layer: "browser",
      coverage: true,
      staged: false,
      push: false,
    });
    expect(parseAffectedArgs(["--push", "--layer", "core"])).toEqual({
      layer: "core",
      coverage: false,
      staged: false,
      push: true,
    });
    expect(() => parseAffectedArgs(["--layer", "database"])).toThrow(
      "layer must be unit, integration, browser, core, or all",
    );
  });

  it("accepts only complete pushed commit ranges", () => {
    expect(parsePushRanges("abc123...def456\n111111...222222")).toEqual([
      "abc123...def456",
      "111111...222222",
    ]);
    expect(parsePushRanges("abc123...def456\n")).toEqual(["abc123...def456"]);
    expect(() => parsePushRanges("abc123")).toThrow("expected base...head ranges");
  });

  it("builds a deterministic affected E2E command from owned browser paths", () => {
    expect(
      selectedBrowserArgs([
        { spec: "tests/e2e/auth-gate.spec.ts", projects: ["chromium"] },
        {
          spec: "tests/e2e/content-flow.spec.ts",
          projects: ["chromium", "firefox"],
          grep: "Content: Quick Create",
        },
      ]),
    ).toEqual([
      "--",
      "--project=chromium",
      "--project=firefox",
      "tests/e2e/auth-gate.spec.ts",
      "tests/e2e/content-flow.spec.ts",
      "--grep",
      "(?:Content: Quick Create)",
    ]);
  });

  it("builds a manual area selection without requiring a Git diff", () => {
    const result = buildManualClassification("auth", manifest);

    expect(result.kind).toBe("targeted");
    expect(result.areaIds).toEqual(["auth"]);
    expect(result.integrationFiles).toEqual(["tests/integration/auth/**"]);
  });
});
