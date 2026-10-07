import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @regression-guard  — REGRESSION GUARD, not a behaviour test.
 *
 * TEST-13 (GAP-FULL-REVIEW-2026-08-25): the assertions below read
 * `.dockerignore`, `.github/workflows/ci.yml`,
 * `.github/workflows/deploy.yml`, `Dockerfile`, `docker-compose.yml`,
 * and `scripts/vps/health-check.sh` as strings and match specific
 * tokens. This is intentionally a brittle source-shape guard, not
 * a behaviour test.
 *
 * Three historical incidents drove this file into existence:
 *
 *   1. `.DS_Store` (a macOS metadata file) ended up baked into the
 *      Drizzle migration context, which broke `drizzle-kit generate`
 *      on a fresh checkout from a developer's home directory.
 *   2. The `build-smoke` job was missing the
 *      `AGENCY_COOKIE_SECRET` env var, so the production container
 *      crashed on first request with "missing secret" — the unit
 *      test would have caught it if the env had been declared
 *      anywhere in the CI flow.
 *   3. `APP_VERSION` was being set to the mutable image tag instead
 *      of the immutable Git SHA, so a re-tagged image would pass
 *      the version check despite shipping a different build.
 *
 * If you are refactoring the CI / Docker files and this test fails:
 * update BOTH the source AND the assertions below. The test is the
 * contract; the source must follow. Do not "fix" the test by
 * loosening the regex — that erases the regression guard.
 */
describe("CI production-image smoke environment", () => {
  it("excludes nested macOS metadata from the Drizzle migration context", () => {
    const dockerIgnore = readFileSync(resolve(process.cwd(), ".dockerignore"), "utf8");

    expect(dockerIgnore).toMatch(/^\*\*\/\.DS_Store$/m);
  });

  it("provides the required agency-cookie secret to the production container", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const buildSmokeStart = workflow.indexOf("  build-smoke:");
    const buildSmokeEnd = workflow.indexOf("  trends-quality:", buildSmokeStart);
    const buildSmoke = workflow.slice(buildSmokeStart, buildSmokeEnd);

    expect(buildSmokeStart).toBeGreaterThan(-1);
    expect(buildSmokeEnd).toBeGreaterThan(buildSmokeStart);
    expect(buildSmoke).toContain(
      "AGENCY_COOKIE_SECRET: ci_agency_cookie_secret_not_for_production_xxxxxxxxx",
    );
    expect(buildSmoke).toContain('-e "AGENCY_COOKIE_SECRET=$AGENCY_COOKIE_SECRET"');
  });

  it("keeps the Docker liveness smoke independent from Postgres", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const buildSmokeStart = workflow.indexOf("  build-smoke:");
    const buildSmokeEnd = workflow.indexOf("  trends-quality:", buildSmokeStart);
    const buildSmoke = workflow.slice(buildSmokeStart, buildSmokeEnd);

    expect(buildSmoke).not.toContain("    services:");
  });

  it("lets the integration runner own the normal migration before tests", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");

    expect(workflow).not.toContain("- name: Apply migrations");
  });

  it("runs the SMTP certificate probe once per CI run", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");

    expect(workflow.match(/check-smtp-cert\.sh --warn 30 --critical 14/g)).toHaveLength(1);
  });

  it("keeps advisory work off documentation-only pushes and makes E2E SHA selection explicit", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/advisory-quality.yml"),
      "utf8",
    );

    expect(workflow).toContain('paths-ignore: ["docs/**", "**.md", "**.mdx"]');
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).not.toContain("Run coverage attempt 2 after failure");
    expect(workflow).not.toContain("Run E2E attempt 2 after failure");
  });

  it("runs the pushed Chromium check from the immutable workflow SHA", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/advisory-quality.yml"),
      "utf8",
    );
    const e2eStart = workflow.indexOf("  e2e:");
    const e2e = workflow.slice(e2eStart);

    expect(e2eStart).toBeGreaterThan(-1);
    expect(e2e).toContain("ref: ${{ github.sha }}");
    expect(e2e).toContain(
      "if: github.event_name == 'push' && env.ADVISORY_SUITE != 'release-candidate'",
    );
    expect(e2e).toContain("pnpm test:e2e:critical");
  });

  it("keeps the local release command as the complete browser plus visual matrix", () => {
    const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");

    expect(packageJson).toContain(
      '"test:e2e:release": "pnpm test:e2e:isolated && pnpm test:visual"',
    );
  });

  it("performs one dependency audit and reuses its JSON report", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/advisory-quality.yml"),
      "utf8",
    );
    const dependencyStart = workflow.indexOf("  dependency-advisory:");
    const coverageStart = workflow.indexOf("  coverage:", dependencyStart);
    const dependencyJob = workflow.slice(dependencyStart, coverageStart);

    expect(dependencyJob.match(/^\s*pnpm audit --prod/gm)).toHaveLength(1);
    expect(dependencyJob).toContain("audit-report.json");
    expect(dependencyJob).not.toContain("execSync('pnpm audit");
  });

  it("bakes the immutable Git SHA and does not replace it with the mutable image tag", () => {
    const ciWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const deployWorkflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/deploy.yml"),
      "utf8",
    );
    const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");
    const compose = readFileSync(resolve(process.cwd(), "docker-compose.yml"), "utf8");
    const healthCheck = readFileSync(resolve(process.cwd(), "scripts/vps/health-check.sh"), "utf8");

    // The contract is "APP_VERSION must be set to the immutable SHA,
    // never to the mutable image tag". CI uses the shell's GITHUB_SHA;
    // deploy resolves the requested ref to a commit before building.
    // Shell quoting is intentional because actionlint/shellcheck must
    // also accept the workflow's run blocks.
    expect(ciWorkflow).toMatch(/--build-arg APP_VERSION="?\$GITHUB_SHA"?/);
    expect(deployWorkflow).toContain("APP_VERSION=${{ needs.resolve.outputs.sha }}");
    expect(dockerfile).toContain("ENV APP_VERSION=$APP_VERSION");
    expect(compose).not.toContain("APP_VERSION: ${IMAGE_TAG:-latest}");
    expect(healthCheck).toContain('EXPECTED_APP_VERSION="${EXPECTED_APP_VERSION:-}"');
    // The health endpoint returns a 7-char short SHA (commit 721afbe
    // moved from the full 40-char SHA). The deploy script still passes
    // the full SHA as EXPECTED_APP_VERSION, so the script compares on
    // a length-aware prefix. The exact-match assertion from the
    // original test was wrong once that change landed; commit
    // 883d4bf updated the script but never updated this guard.
    expect(healthCheck).toContain('expected_prefix="${EXPECTED_APP_VERSION:0:${#version}}"');
    expect(healthCheck).toContain('[ "$version" = "$expected_prefix" ]');
  });
});
