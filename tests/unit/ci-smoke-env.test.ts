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
    const buildSmokeEnd = workflow.indexOf("  check-smtp-cert:", buildSmokeStart);
    const buildSmoke = workflow.slice(buildSmokeStart, buildSmokeEnd);

    expect(buildSmokeStart).toBeGreaterThan(-1);
    expect(buildSmokeEnd).toBeGreaterThan(buildSmokeStart);
    expect(buildSmoke).toContain(
      "AGENCY_COOKIE_SECRET: ci_agency_cookie_secret_not_for_production_xxxxxxxxx",
    );
    expect(buildSmoke).toContain("-e AGENCY_COOKIE_SECRET=$AGENCY_COOKIE_SECRET");
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

    expect(ciWorkflow).toContain("--build-arg APP_VERSION=${GITHUB_SHA}");
    expect(deployWorkflow).toContain(
      "APP_VERSION=${{ github.event.workflow_run.head_sha || github.sha }}",
    );
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
