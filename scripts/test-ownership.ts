import type { TestOwnershipManifest } from "./test-affected-core";

const chromium = ["chromium"];
const visualChromium = ["visual-chromium"];

/**
 * Cross-layer ownership for the local affected-test runner.
 *
 * Keep this manifest deliberately explicit. A source path that is not covered
 * by an area is safer when it escalates to the full relevant suites than when
 * it quietly runs nothing.
 */
export const TEST_OWNERSHIP: TestOwnershipManifest = {
  unitSelection: {
    source: "vitest-related",
    directTest: "owned-files",
  },
  globalSourceGlobs: [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "next.config.ts",
    "playwright.config.ts",
    "vitest.config.ts",
    "vitest.integration.config.ts",
    "tests/setup.ts",
    "tests/integration/setup.ts",
    "tests/e2e/_helpers.ts",
    "scripts/run-e2e-tests.ts",
    "scripts/run-integration-tests.ts",
    "scripts/test-affected-core.ts",
    "scripts/test-affected.ts",
    "scripts/test-ownership.ts",
    "tests/unit/testing/test-affected-core.test.ts",
    "tests/e2e/stitch-cases.ts",
    "src/app/globals.css",
    "src/app/**/layout.tsx",
    "src/app/**/loading.tsx",
    "src/app/**/error.tsx",
    "src/components/app-shell/**",
    "src/components/ui/**",
    "src/lib/auth/**",
    "src/lib/db/**",
    "src/lib/migrations/**",
    "src/proxy.ts",
    "src/app/layout.tsx",
    "src/messages/**",
    "src/lib/i18n/**",
    ".github/workflows/**",
  ],
  areas: [
    {
      id: "auth",
      sourceGlobs: ["src/lib/auth/**", "src/app/(auth)/**", "src/app/api/auth/**", "src/proxy.ts"],
      unitFiles: ["tests/unit/auth/**", "tests/unit/auth-*.test.ts"],
      integrationFiles: [
        "tests/integration/auth/**",
        "tests/integration/bootstrap-concurrency.test.ts",
        "tests/integration/invitation-concurrency.test.ts",
        "tests/integration/client-isolation.test.ts",
      ],
      browser: [
        { spec: "tests/e2e/auth-gate.spec.ts", projects: chromium },
        { spec: "tests/e2e/auth-middleware.spec.ts", projects: chromium },
        { spec: "tests/e2e/pre-seed-auth.spec.ts", projects: chromium },
        { spec: "tests/e2e/a11y.spec.ts", projects: chromium, grep: "@a11y" },
      ],
    },
    {
      id: "content",
      sourceGlobs: [
        "src/lib/content/**",
        "src/lib/format-payload/**",
        "src/components/content/**",
        "src/components/planning/**",
        "src/app/(app)/app/w/[slug]/planning/**",
      ],
      unitFiles: [
        "tests/unit/content/**",
        "tests/unit/content-*.test.ts",
        "tests/unit/planning/**",
      ],
      integrationFiles: [
        "tests/integration/journey.test.ts",
        "tests/integration/enriched-list-filters.test.ts",
        "tests/integration/publishing-m4.test.ts",
      ],
      browser: [
        { spec: "tests/e2e/content-flow.spec.ts", projects: chromium },
        { spec: "tests/e2e/discussions.spec.ts", projects: chromium },
        { spec: "tests/e2e/publish-package.spec.ts", projects: chromium },
      ],
    },
    {
      id: "publishing",
      sourceGlobs: [
        "src/lib/publishing/**",
        "src/lib/deliveries/**",
        "src/app/(app)/app/w/[slug]/planning/[id]/publish/**",
      ],
      unitFiles: ["tests/unit/publishing/**", "tests/unit/publishing-*.test.ts"],
      integrationFiles: [
        "tests/integration/publishing-m4.test.ts",
        "tests/integration/usage-tracking.test.ts",
      ],
      browser: [
        { spec: "tests/e2e/publish-package.spec.ts", projects: chromium },
        { spec: "tests/e2e/content-flow.spec.ts", projects: chromium, grep: "published" },
        {
          spec: "tests/e2e/visual-regression.spec.ts",
          projects: visualChromium,
          grep: "design-queue|reviews",
        },
      ],
    },
    {
      id: "workspace",
      sourceGlobs: [
        "src/lib/workspaces/**",
        "src/lib/dashboard/**",
        "src/components/workspace/**",
        "src/app/(app)/app/workspaces/**",
        "src/app/(app)/app/w/[slug]/page.tsx",
      ],
      unitFiles: [
        "tests/unit/workspace/**",
        "tests/unit/workspaces/**",
        "tests/unit/workspace-*.test.ts",
      ],
      integrationFiles: [
        "tests/integration/schema.test.ts",
        "tests/integration/client-isolation.test.ts",
        "tests/integration/enriched-list-filters.test.ts",
        "tests/integration/agency-singleton-constraint.test.ts",
      ],
      browser: [
        { spec: "tests/e2e/workspace.spec.ts", projects: chromium },
        { spec: "tests/e2e/workspace-tenant-isolation.spec.ts", projects: chromium },
        { spec: "tests/e2e/agency-switcher.spec.ts", projects: chromium },
        {
          spec: "tests/e2e/visual-regression.spec.ts",
          projects: visualChromium,
          grep: "workspaces|workspace-overview|my-work",
        },
      ],
    },
    {
      id: "brand-kit",
      sourceGlobs: [
        "src/lib/brand/**",
        "src/components/brand-kit/**",
        "src/app/(app)/app/w/[slug]/brand-kit/**",
      ],
      unitFiles: ["tests/unit/brand/**", "tests/unit/brand-kit/**"],
      integrationFiles: ["tests/integration/brand-kit.test.ts"],
      browser: [
        { spec: "tests/e2e/administration.spec.ts", projects: chromium },
        { spec: "tests/e2e/a11y-routes.spec.ts", projects: chromium, grep: "brand-kit" },
        {
          spec: "tests/e2e/visual-regression.spec.ts",
          projects: visualChromium,
          grep: "brand-kit",
        },
      ],
    },
    {
      id: "channels-social",
      sourceGlobs: [
        "src/lib/channels/**",
        "src/lib/social/**",
        "src/components/channels/**",
        "src/app/(app)/app/w/[slug]/channels/**",
        "src/app/(app)/app/w/[slug]/analytics/social/**",
      ],
      unitFiles: [
        "tests/unit/channels/**",
        "tests/unit/social/**",
        "tests/unit/*social*.test.ts",
        "tests/unit/*channel*.test.ts",
      ],
      integrationFiles: [
        "tests/integration/social-analytics.test.ts",
        "tests/integration/social-repository.test.ts",
        "tests/integration/social-dek-repository.test.ts",
      ],
      browser: [
        { spec: "tests/e2e/social-connections.spec.ts", projects: chromium },
        { spec: "tests/e2e/social-analytics.spec.ts", projects: chromium },
        {
          spec: "tests/e2e/a11y-routes.spec.ts",
          projects: chromium,
          grep: "channels|analytics/social",
        },
        { spec: "tests/e2e/visual-regression.spec.ts", projects: visualChromium, grep: "channels" },
      ],
    },
    {
      id: "ai",
      sourceGlobs: [
        "src/lib/ai/**",
        "src/components/ai/**",
        "src/app/(app)/app/agency-settings/ai/**",
        "src/app/(app)/app/w/[slug]/ai-settings/**",
      ],
      unitFiles: ["tests/unit/ai-*.test.ts", "tests/unit/ai-*.test.tsx"],
      integrationFiles: ["tests/integration/ai-governance.test.ts"],
      browser: [
        {
          spec: "tests/e2e/a11y-routes.spec.ts",
          projects: chromium,
          grep: "agency-settings/ai|ai-settings",
        },
        {
          spec: "tests/e2e/visual-regression.spec.ts",
          projects: visualChromium,
          grep: "ai-settings",
        },
      ],
    },
    {
      id: "platform",
      sourceGlobs: [
        "src/lib/platform/**",
        "src/app/(app)/app/platform/**",
        "src/components/platform/**",
      ],
      unitFiles: ["tests/unit/platform/**", "tests/unit/platform-*.test.ts"],
      integrationFiles: [
        "tests/integration/platform-access.test.ts",
        "tests/integration/platform-agencies.test.ts",
        "tests/integration/support-access.test.ts",
      ],
      browser: [
        { spec: "tests/e2e/platform-access.spec.ts", projects: chromium },
        { spec: "tests/e2e/platform-access-responsive.spec.ts", projects: chromium },
        { spec: "tests/e2e/platform-overview.spec.ts", projects: chromium },
      ],
    },
    {
      id: "notifications-discussions",
      sourceGlobs: [
        "src/lib/notifications/**",
        "src/lib/discussions/**",
        "src/components/notifications/**",
        "src/components/comments/**",
        "src/app/(app)/app/w/[slug]/discussions/**",
      ],
      unitFiles: [
        "tests/unit/notifications/**",
        "tests/unit/comments/**",
        "tests/unit/*discussion*.test.ts",
        "tests/unit/*notification*.test.ts",
      ],
      integrationFiles: [
        "tests/integration/notifications/**",
        "tests/integration/discussions.test.ts",
      ],
      browser: [{ spec: "tests/e2e/discussions.spec.ts", projects: chromium }],
    },
    {
      id: "forms",
      sourceGlobs: ["src/components/forms/**", "src/components/ui/**"],
      unitFiles: ["tests/unit/forms/**", "tests/unit/ui/**"],
      integrationFiles: [],
      browser: [
        { spec: "tests/e2e/content-flow.spec.ts", projects: chromium },
        { spec: "tests/e2e/administration.spec.ts", projects: chromium },
        { spec: "tests/e2e/users/add-directly.spec.ts", projects: chromium },
        {
          spec: "tests/e2e/dialog-centering-rtl.spec.ts",
          projects: chromium,
          grep: "centered dialogs",
        },
      ],
    },
    {
      id: "security-observability",
      sourceGlobs: [
        "src/lib/security/**",
        "src/lib/observability/**",
        "src/lib/validation/**",
        "src/app/api/health/**",
      ],
      unitFiles: [
        "tests/unit/validation/**",
        "tests/unit/*security*.test.ts",
        "tests/unit/*observability*.test.ts",
        "tests/unit/*health*.test.ts",
      ],
      integrationFiles: [],
      browser: [
        { spec: "tests/e2e/health.spec.ts", projects: chromium },
        { spec: "tests/e2e/error-states.spec.ts", projects: chromium },
      ],
    },
  ],
};

export type TestAreaId = (typeof TEST_OWNERSHIP.areas)[number]["id"];
